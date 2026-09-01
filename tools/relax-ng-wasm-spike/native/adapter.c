#define _GNU_SOURCE

#include "adapter.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include <libxml/parser.h>
#include <libxml/relaxng.h>
#include <libxml/tree.h>
#include <libxml/xmlerror.h>
#include <libxml/xmlversion.h>

#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
#define MAX_FILES 250
#define MAX_DIAGNOSTICS 500
#define MAX_REQUESTS 500
#else
#define MAX_FILES 128
#define MAX_DIAGNOSTICS 128
#define MAX_REQUESTS 128
#endif
#define MAX_PATH 512
#define MAX_MESSAGE 1024
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
#define RESULT_CAPACITY 2097152
#else
#define RESULT_CAPACITY 262144
#endif

typedef struct {
    char path[MAX_PATH];
    unsigned char *bytes;
    size_t size;
} ProjectFile;

typedef struct {
    int domain;
    int code;
    int level;
    int line;
    int column;
    char file[MAX_PATH];
    char message[MAX_MESSAGE];
} Diagnostic;

typedef struct {
    char requested[MAX_PATH];
    char resolved[MAX_PATH];
    char outcome[24];
} DependencyRequest;

static ProjectFile files[MAX_FILES];
static Diagnostic diagnostics[MAX_DIAGNOSTICS];
static DependencyRequest requests[MAX_REQUESTS];
static int file_count;
static int diagnostic_count;
static int request_count;
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
static int diagnostics_truncated;
#endif
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
static char current_attempt[129];
#else
static int current_attempt;
#endif
static size_t input_bytes;
static char result_json[RESULT_CAPACITY];
#ifndef XML_CAROUSEL_RELAXNG_PRODUCTION
static char dump_text[32768];
static char dom_text[32768];
#endif

static void copy_text(char *target, size_t capacity, const char *source) {
    size_t length;
    if (capacity == 0) return;
    if (source == NULL) source = "";
    length = strlen(source);
    while ((length > 0) && isspace((unsigned char) source[length - 1])) length--;
    if (length >= capacity) length = capacity - 1;
    memcpy(target, source, length);
    target[length] = '\0';
}

static void json_string(char **cursor, size_t *remaining, const char *value) {
    const unsigned char *p = (const unsigned char *) (value == NULL ? "" : value);
    int n;
    if (*remaining < 3) return;
    *(*cursor)++ = '"'; (*remaining)--;
    while ((*p != '\0') && (*remaining > 7)) {
        if ((*p == '"') || (*p == '\\')) {
            *(*cursor)++ = '\\'; *(*cursor)++ = (char) *p; *remaining -= 2;
        } else if (*p == '\n') {
            *(*cursor)++ = '\\'; *(*cursor)++ = 'n'; *remaining -= 2;
        } else if (*p == '\r') {
            *(*cursor)++ = '\\'; *(*cursor)++ = 'r'; *remaining -= 2;
        } else if (*p == '\t') {
            *(*cursor)++ = '\\'; *(*cursor)++ = 't'; *remaining -= 2;
        } else if (*p < 0x20) {
            n = snprintf(*cursor, *remaining, "\\u%04x", *p);
            *cursor += n; *remaining -= (size_t) n;
        } else {
            *(*cursor)++ = (char) *p; (*remaining)--;
        }
        p++;
    }
    *(*cursor)++ = '"'; (*remaining)--;
    **cursor = '\0';
}

static void add_diagnostic(int domain, int code, int level, const char *file,
                           int line, int column, const char *message) {
    Diagnostic *d;
    if (diagnostic_count >= MAX_DIAGNOSTICS) {
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
        diagnostics_truncated = 1;
#endif
        return;
    }
    d = &diagnostics[diagnostic_count++];
    d->domain = domain; d->code = code; d->level = level;
    d->line = line; d->column = column;
    copy_text(d->file, sizeof(d->file), file);
    copy_text(d->message, sizeof(d->message), message);
}

static void structured_error(void *context, const xmlError *error) {
    (void) context;
    if (error == NULL) return;
    add_diagnostic(error->domain, error->code, error->level, error->file,
                   error->line, error->int2, error->message);
}

static int unsafe_reference(const char *url) {
    const char *p;
    if ((url == NULL) || (*url == '\0')) return 1;
    if ((url[0] == '/') || (url[0] == '\\')) return 1;
    if (strstr(url, "\\") != NULL) return 1;
    if (strchr(url, '%') != NULL) return 1;
    if ((strlen(url) > 1) && isalpha((unsigned char) url[0]) && (url[1] == ':')) return 1;
    p = strchr(url, ':');
    if (p != NULL) return 1;
    return 0;
}

static int normalize_path(const char *input, char *output, size_t capacity) {
    char copy[MAX_PATH];
    char *segment;
    char *save = NULL;
    size_t used = 0;
    if (unsafe_reference(input) || (strlen(input) >= sizeof(copy))) return 0;
    copy_text(copy, sizeof(copy), input);
    segment = strtok_r(copy, "/", &save);
    while (segment != NULL) {
        size_t len = strlen(segment);
        if ((strcmp(segment, ".") == 0) || (len == 0)) {
            segment = strtok_r(NULL, "/", &save);
            continue;
        }
        if (strcmp(segment, "..") == 0) return 0;
        if (used + len + (used ? 1 : 0) + 1 > capacity) return 0;
        if (used) output[used++] = '/';
        memcpy(output + used, segment, len); used += len;
        segment = strtok_r(NULL, "/", &save);
    }
    output[used] = '\0';
    return used > 0;
}

static ProjectFile *find_file(const char *path) {
    int i;
    for (i = 0; i < file_count; i++) {
        if (strcmp(files[i].path, path) == 0) return &files[i];
    }
    return NULL;
}

static xmlParserErrors project_loader(void *context, const char *url,
                                      const char *public_id,
                                      xmlResourceType type,
                                      xmlParserInputFlags flags,
                                      xmlParserInput **out) {
    const char prefix[] = "project:///";
    const char *candidate = url;
    char normalized[MAX_PATH] = "";
    ProjectFile *file;
    DependencyRequest *request = NULL;
    (void) context; (void) public_id; (void) type; (void) flags;
    *out = NULL;
    if (request_count < MAX_REQUESTS) {
        request = &requests[request_count++];
        copy_text(request->requested, sizeof(request->requested), url);
    }
    if ((url != NULL) && (strncmp(url, prefix, sizeof(prefix) - 1) == 0)) {
        candidate = url + sizeof(prefix) - 1;
    }
    if (!normalize_path(candidate, normalized, sizeof(normalized))) {
        if (request != NULL) copy_text(request->outcome, sizeof(request->outcome), "blocked");
        add_diagnostic(XML_FROM_IO, XML_IO_NETWORK_ATTEMPT, XML_ERR_ERROR,
                       url, 0, 0, "Blocked external or unsafe project reference");
        return XML_IO_NETWORK_ATTEMPT;
    }
    if (request != NULL) copy_text(request->resolved, sizeof(request->resolved), normalized);
    file = find_file(normalized);
    if (file == NULL) {
        if (request != NULL) copy_text(request->outcome, sizeof(request->outcome), "missing");
        return XML_IO_ENOENT;
    }
    *out = xmlNewInputFromMemory(url, file->bytes, file->size,
                                 XML_INPUT_BUF_STATIC | XML_INPUT_BUF_ZERO_TERMINATED);
    if (*out == NULL) return XML_ERR_NO_MEMORY;
    if (request != NULL) copy_text(request->outcome, sizeof(request->outcome), "resolved");
    return XML_ERR_OK;
}

#ifndef XML_CAROUSEL_RELAXNG_PRODUCTION
static void append_dom_node(xmlNode *node, int depth, const char *source) {
    char line[1024];
    char attributes[512] = "";
    xmlNode *child;
    xmlAttr *attribute;
    const char *ns = (node->ns && node->ns->href) ? (const char *) node->ns->href : "";
    if (node->type == XML_ELEMENT_NODE) {
        for (attribute = node->properties; attribute != NULL; attribute = attribute->next) {
            xmlChar *value = xmlNodeListGetString(node->doc, attribute->children, 1);
            if (attributes[0] != '\0') strncat(attributes, ";", sizeof(attributes) - strlen(attributes) - 1);
            strncat(attributes, (const char *) attribute->name, sizeof(attributes) - strlen(attributes) - 1);
            strncat(attributes, "=", sizeof(attributes) - strlen(attributes) - 1);
            if (value != NULL) strncat(attributes, (const char *) value, sizeof(attributes) - strlen(attributes) - 1);
            xmlFree(value);
        }
        snprintf(line, sizeof(line), "%d|%s|%s|%ld|%s|%s\n", depth,
                 (const char *) node->name, ns, xmlGetLineNo(node), source ? source : "", attributes);
        strncat(dom_text, line, sizeof(dom_text) - strlen(dom_text) - 1);
    }
    for (child = node->children; child != NULL; child = child->next)
        append_dom_node(child, depth + 1, source);
}
#endif

static void build_result(const char *status, double elapsed_ms) {
    char *c = result_json;
    size_t r = sizeof(result_json);
    int i, n;
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
    if (diagnostics_truncated && (diagnostic_count > 0)) {
        Diagnostic *truncation = &diagnostics[diagnostic_count - 1];
        memset(truncation, 0, sizeof(*truncation));
        truncation->domain = XML_FROM_RELAXNGP;
        truncation->code = XML_ERR_INTERNAL_ERROR;
        truncation->level = XML_ERR_ERROR;
        copy_text(truncation->message, sizeof(truncation->message),
                  "RELAX NG diagnostic limit reached; additional diagnostics were truncated");
    }
    n = snprintf(c, r, "{\"attemptId\":");
    c += n; r -= (size_t) n; json_string(&c, &r, current_attempt);
    n = snprintf(c, r, ",\"engine\":\"libxml2\",\"engineVersion\":");
#else
    n = snprintf(c, r, "{\"attemptId\":%d,\"engine\":\"libxml2\",\"engineVersion\":", current_attempt);
#endif
    c += n; r -= (size_t) n; json_string(&c, &r, LIBXML_DOTTED_VERSION);
    n = snprintf(c, r, ",\"status\":"); c += n; r -= (size_t) n; json_string(&c, &r, status);
    n = snprintf(c, r, ",\"elapsedMs\":%.3f,\"fileCount\":%d,\"inputBytes\":%zu,\"diagnostics\":[", elapsed_ms, file_count, input_bytes);
    c += n; r -= (size_t) n;
    for (i = 0; i < diagnostic_count; i++) {
        Diagnostic *d = &diagnostics[i];
        if (i) { *c++ = ','; r--; }
        n = snprintf(c, r, "{\"severity\":%d,\"domain\":%d,\"nativeCode\":%d,\"source\":", d->level, d->domain, d->code);
        c += n; r -= (size_t) n; json_string(&c, &r, d->file);
        n = snprintf(c, r, ",\"line\":%d,\"column\":%d,\"message\":", d->line, d->column);
        c += n; r -= (size_t) n; json_string(&c, &r, d->message);
        *c++ = '}'; r--;
    }
    n = snprintf(c, r, "],\"dependencyRequests\":["); c += n; r -= (size_t) n;
    for (i = 0; i < request_count; i++) {
        DependencyRequest *q = &requests[i];
        if (i) { *c++ = ','; r--; }
        n = snprintf(c, r, "{\"requested\":"); c += n; r -= (size_t) n; json_string(&c, &r, q->requested);
        n = snprintf(c, r, ",\"resolved\":"); c += n; r -= (size_t) n; json_string(&c, &r, q->resolved);
        n = snprintf(c, r, ",\"outcome\":"); c += n; r -= (size_t) n; json_string(&c, &r, q->outcome);
        *c++ = '}'; r--;
    }
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
    n = snprintf(c, r, "]"); c += n; r -= (size_t) n;
#else
    n = snprintf(c, r, "],\"domProbe\":"); c += n; r -= (size_t) n; json_string(&c, &r, dom_text);
    n = snprintf(c, r, ",\"compiledDump\":"); c += n; r -= (size_t) n; json_string(&c, &r, dump_text);
#endif
    snprintf(c, r, "}");
}

static int reset_project(void) {
    int i;
    for (i = 0; i < file_count; i++) free(files[i].bytes);
    memset(files, 0, sizeof(files));
    memset(diagnostics, 0, sizeof(diagnostics));
    memset(requests, 0, sizeof(requests));
    file_count = diagnostic_count = request_count = 0;
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
    diagnostics_truncated = 0;
#endif
    input_bytes = 0;
    result_json[0] = '\0';
#ifndef XML_CAROUSEL_RELAXNG_PRODUCTION
    dump_text[0] = dom_text[0] = '\0';
#endif
    return 0;
}

static int add_project_file(const char *path, const unsigned char *bytes, size_t size) {
    char normalized[MAX_PATH];
    ProjectFile *file;
    if ((file_count >= MAX_FILES) || !normalize_path(path, normalized, sizeof(normalized))) return -1;
    if (find_file(normalized) != NULL) return -2;
    file = &files[file_count++];
    copy_text(file->path, sizeof(file->path), normalized);
    file->bytes = malloc(size + 1);
    if (file->bytes == NULL) return -3;
    memcpy(file->bytes, bytes, size); file->bytes[size] = 0; file->size = size;
    input_bytes += size;
    return 0;
}

static int compile_project(const char *entry_path, int parser_mode) {
    char normalized[MAX_PATH];
    char source_url[MAX_PATH + 16];
    ProjectFile *entry;
    xmlParserCtxt *xml_ctxt = NULL;
    xmlDoc *doc = NULL;
    xmlRelaxNGParserCtxt *rng_ctxt = NULL;
    xmlRelaxNG *schema = NULL;
    clock_t begin = clock();
    const char *status = "invalid";
#ifndef XML_CAROUSEL_RELAXNG_PRODUCTION
    FILE *stream = NULL;
    char *dump = NULL;
    size_t dump_size = 0;
#endif
    int blocked = 0, i;

    diagnostic_count = request_count = 0;
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
    diagnostics_truncated = 0;
#endif
#ifndef XML_CAROUSEL_RELAXNG_PRODUCTION
    dump_text[0] = dom_text[0] = '\0';
#endif
    if (!normalize_path(entry_path, normalized, sizeof(normalized)) ||
        ((entry = find_file(normalized)) == NULL)) {
        add_diagnostic(XML_FROM_IO, XML_IO_ENOENT, XML_ERR_ERROR, entry_path, 0, 0,
                       "Entry path is not a supplied project member");
        build_result("internal-error", 0); return 4;
    }
    snprintf(source_url, sizeof(source_url), "project:///%s", normalized);
#ifndef XML_CAROUSEL_RELAXNG_PRODUCTION
    if (parser_mode == 1) {
        rng_ctxt = xmlRelaxNGNewMemParserCtxt((const char *) entry->bytes, (int) entry->size);
    } else {
#endif
        xml_ctxt = xmlNewParserCtxt();
        if (xml_ctxt != NULL) {
            xmlCtxtSetErrorHandler(xml_ctxt, structured_error, NULL);
            xmlCtxtSetResourceLoader(xml_ctxt, project_loader, NULL);
            doc = xmlCtxtReadMemory(xml_ctxt, (const char *) entry->bytes,
                                    (int) entry->size, source_url, NULL,
                                    XML_PARSE_NONET | XML_PARSE_BIG_LINES);
        }
        if (doc != NULL) {
#ifndef XML_CAROUSEL_RELAXNG_PRODUCTION
            append_dom_node(xmlDocGetRootElement(doc), 0, source_url);
#endif
            rng_ctxt = xmlRelaxNGNewDocParserCtxt(doc);
        }
#ifndef XML_CAROUSEL_RELAXNG_PRODUCTION
    }
#else
    (void) parser_mode;
#endif
    if (rng_ctxt != NULL) {
        xmlRelaxParserSetIncLImit(rng_ctxt, 64);
        xmlRelaxNGSetParserStructuredErrors(rng_ctxt, structured_error, NULL);
        xmlRelaxNGSetResourceLoader(rng_ctxt, project_loader, NULL);
        schema = xmlRelaxNGParse(rng_ctxt);
    }
    if (schema != NULL) {
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
        status = "valid";
#else
        status = "accepted";
        stream = open_memstream(&dump, &dump_size);
        if (stream != NULL) {
            xmlRelaxNGDumpTree(stream, schema);
            fclose(stream);
            if (dump != NULL) copy_text(dump_text, sizeof(dump_text), dump);
        }
#endif
    }
    for (i = 0; i < request_count; i++)
        if ((strcmp(requests[i].outcome, "blocked") == 0)
#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
            || (strcmp(requests[i].outcome, "missing") == 0)
#endif
        ) blocked = 1;
    if ((schema == NULL) && blocked) status = "blocked";
    build_result(status, 1000.0 * (double) (clock() - begin) / CLOCKS_PER_SEC);
#ifndef XML_CAROUSEL_RELAXNG_PRODUCTION
    free(dump);
#endif
    if (schema != NULL) xmlRelaxNGFree(schema);
    if (rng_ctxt != NULL) xmlRelaxNGFreeParserCtxt(rng_ctxt);
    if (doc != NULL) xmlFreeDoc(doc);
    if (xml_ctxt != NULL) xmlFreeParserCtxt(xml_ctxt);
    return schema != NULL ? 0 : (blocked ? 2 : 1);
}

#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
int relaxng_reset(const char *attempt_id) {
    reset_project();
    copy_text(current_attempt, sizeof(current_attempt), attempt_id);
    return 0;
}
int relaxng_add_file(const char *path, const unsigned char *bytes, size_t size) {
    return add_project_file(path, bytes, size);
}
int relaxng_compile(const char *entry_path) { return compile_project(entry_path, 0); }
const char *relaxng_engine_version(void) { return LIBXML_DOTTED_VERSION; }
const char *relaxng_result_json(void) { return result_json; }
#else
int rng_reset(int attempt_id) {
    reset_project();
    current_attempt = attempt_id;
    return 0;
}
int rng_add_file(const char *path, const unsigned char *bytes, size_t size) {
    return add_project_file(path, bytes, size);
}
int rng_compile(const char *entry_path, int parser_mode) {
    return compile_project(entry_path, parser_mode);
}
const char *rng_engine_version(void) { return LIBXML_DOTTED_VERSION; }
const char *rng_result_json(void) { return result_json; }
#endif
