#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include <xercesc/framework/MemBufInputSource.hpp>
#include <xercesc/framework/XMLValidityCodes.hpp>
#include <xercesc/parsers/XercesDOMParser.hpp>
#include <xercesc/sax/ErrorHandler.hpp>
#include <xercesc/sax/SAXParseException.hpp>
#include <xercesc/util/PlatformUtils.hpp>
#include <xercesc/util/XMLResourceIdentifier.hpp>
#include <xercesc/util/XMLString.hpp>
#include <xercesc/util/XMLUni.hpp>
#include <xercesc/util/XMLEntityResolver.hpp>
#include <xercesc/util/XercesVersion.hpp>
#include <xercesc/validators/common/Grammar.hpp>
#include <xercesc/validators/DTD/DTDGrammar.hpp>

using namespace xercesc;

namespace {

struct Diagnostic {
  std::string severity;
  std::string message;
  std::string file;
  std::string code;
  unsigned long long line = 0;
  unsigned long long column = 0;
  std::string phase;
};

std::map<std::string, std::vector<unsigned char>> projectFiles;
std::string lastResult;
bool initialized = false;

std::string transcode(const XMLCh* value) {
  if (!value) return {};
  char* raw = XMLString::transcode(value);
  std::string result = raw ? raw : "";
  XMLString::release(&raw);
  return result;
}

std::string jsonEscape(const std::string& value) {
  std::ostringstream out;
  for (const unsigned char character : value) {
    switch (character) {
      case '\"': out << "\\\""; break;
      case '\\': out << "\\\\"; break;
      case '\b': out << "\\b"; break;
      case '\f': out << "\\f"; break;
      case '\n': out << "\\n"; break;
      case '\r': out << "\\r"; break;
      case '\t': out << "\\t"; break;
      default:
        if (character < 0x20) {
          const char* hex = "0123456789abcdef";
          out << "\\u00" << hex[(character >> 4) & 0x0f] << hex[character & 0x0f];
        } else {
          out << static_cast<char>(character);
        }
    }
  }
  return out.str();
}

bool startsWithCaseInsensitive(const std::string& value, const std::string& prefix) {
  if (value.size() < prefix.size()) return false;
  for (std::size_t index = 0; index < prefix.size(); ++index) {
    if (std::tolower(static_cast<unsigned char>(value[index])) !=
        std::tolower(static_cast<unsigned char>(prefix[index]))) return false;
  }
  return true;
}

int hexValue(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  if (value >= 'A' && value <= 'F') return value - 'A' + 10;
  return -1;
}

bool percentDecode(const std::string& raw, std::string& value,
                   std::string& reason) {
  value = raw;
  for (int pass = 0; pass < 3; ++pass) {
    std::string decoded;
    bool changed = false;
    for (std::size_t index = 0; index < value.size(); ++index) {
      if (value[index] == '%') {
        if (index + 2 >= value.size()) {
          reason = "invalid percent encoding";
          return false;
        }
        const int high = hexValue(value[index + 1]);
        const int low = hexValue(value[index + 2]);
        if (high < 0 || low < 0) {
          reason = "invalid percent encoding";
          return false;
        }
        decoded.push_back(static_cast<char>((high << 4) | low));
        index += 2;
        changed = true;
        continue;
      }
      decoded.push_back(value[index]);
    }
    value = decoded;
    if (!changed) break;
  }
  return true;
}

std::string stripProjectUri(std::string value) {
  if (startsWithCaseInsensitive(value, "project:///")) return value.substr(11);
  if (startsWithCaseInsensitive(value, "/project/")) return value.substr(9);
  return value;
}

bool containsControlCharacter(const std::string& value) {
  for (std::size_t index = 0; index < value.size(); ++index) {
    const unsigned char current = static_cast<unsigned char>(value[index]);
    if (current < 0x20 || current == 0x7f) return true;
    if (current == 0xc2 && index + 1 < value.size()) {
      const unsigned char next = static_cast<unsigned char>(value[index + 1]);
      if (next >= 0x80 && next <= 0x9f) return true;
    }
  }
  return false;
}

std::size_t utf8CodePointCount(const std::string& value) {
  return std::count_if(value.begin(), value.end(), [](unsigned char byte) {
    return (byte & 0xc0) != 0x80;
  });
}

bool decodeProjectPath(const std::string& raw, std::string& value,
                       bool& projectQualified, std::string& reason,
                       bool allowProjectQualified) {
  if (!percentDecode(raw, value, reason)) return false;
  std::replace(value.begin(), value.end(), '\\', '/');
  projectQualified = startsWithCaseInsensitive(value, "project:///") ||
                     startsWithCaseInsensitive(value, "/project/");
  if (projectQualified && !allowProjectQualified) {
    reason = "qualified project path is not allowed here";
    return false;
  }
  value = stripProjectUri(value);
  if (value.empty()) { reason = "empty path"; return false; }
  if (value.find('?') != std::string::npos ||
      value.find('#') != std::string::npos) {
    reason = "query or fragment component";
    return false;
  }
  if (!projectQualified && (value[0] == '/' || value.rfind("//", 0) == 0)) {
    reason = "absolute or UNC path";
    return false;
  }
  if (!projectQualified && value.size() >= 2 &&
      std::isalpha(static_cast<unsigned char>(value[0])) && value[1] == ':') {
    reason = "drive-letter path";
    return false;
  }
  const std::size_t colon = value.find(':');
  const std::size_t slash = value.find('/');
  if (!projectQualified && colon != std::string::npos &&
      (slash == std::string::npos || colon < slash)) {
    reason = "URI scheme";
    return false;
  }
  return true;
}

bool normalizeProjectPath(const std::string& raw, std::string& normalized,
                          std::string& reason,
                          bool allowProjectQualified = false) {
  std::string value;
  bool projectQualified = false;
  if (!decodeProjectPath(raw, value, projectQualified, reason,
                         allowProjectQualified)) return false;
  std::vector<std::string> segments;
  std::size_t start = 0;
  while (start <= value.size()) {
    const std::size_t end = value.find('/', start);
    const std::string segment = value.substr(start, end == std::string::npos ? value.size() - start : end - start);
    if (segment.empty() || segment == "." || segment == "..") {
      reason = "empty or traversal segment";
      return false;
    }
    if (containsControlCharacter(segment)) {
      reason = "control character";
      return false;
    }
    segments.push_back(segment);
    if (end == std::string::npos) break;
    start = end + 1;
  }
  std::ostringstream joined;
  for (std::size_t index = 0; index < segments.size(); ++index) {
    if (index) joined << '/';
    joined << segments[index];
  }
  normalized = joined.str();
  if (utf8CodePointCount(normalized) > 512) {
    reason = "path too long";
    return false;
  }
  if (segments.size() > 32) {
    reason = "path too deep";
    return false;
  }
  return true;
}

bool normalizeResolvedProjectPath(const std::string& raw,
                                  std::string& normalized,
                                  std::string& reason) {
  std::string value;
  bool projectQualified = false;
  if (!decodeProjectPath(raw, value, projectQualified, reason, true)) return false;
  std::vector<std::string> segments;
  std::size_t start = 0;
  while (start <= value.size()) {
    const std::size_t end = value.find('/', start);
    const std::string segment = value.substr(
        start, end == std::string::npos ? value.size() - start : end - start);
    if (segment.empty()) {
      reason = "empty path segment";
      return false;
    }
    if (segment == ".") {
      // A current-directory segment is safe but never retained in the
      // canonical virtual-project namespace.
    } else if (segment == "..") {
      if (segments.empty()) {
        reason = "traversal outside project root";
        return false;
      }
      segments.pop_back();
    } else {
      if (containsControlCharacter(segment)) {
        reason = "control character";
        return false;
      }
      segments.push_back(segment);
    }
    if (end == std::string::npos) break;
    start = end + 1;
  }
  if (segments.empty()) {
    reason = "empty resolved path";
    return false;
  }
  std::ostringstream joined;
  for (std::size_t index = 0; index < segments.size(); ++index) {
    if (index) joined << '/';
    joined << segments[index];
  }
  normalized = joined.str();
  if (utf8CodePointCount(normalized) > 512) {
    reason = "path too long";
    return false;
  }
  if (segments.size() > 32) {
    reason = "path too deep";
    return false;
  }
  return true;
}

std::string diagnosticPath(const std::string& raw) {
  std::string normalized;
  std::string reason;
  return normalizeProjectPath(raw, normalized, reason, true) ? normalized : raw;
}

std::string diagnosticCode(const XMLCh* domain, const unsigned int code) {
  if (XMLString::equals(domain, XMLUni::fgValidityDomain)) {
    return "xerces-validity:" + std::to_string(code);
  }
  if (XMLString::equals(domain, XMLUni::fgXMLErrDomain)) {
    return "xerces-xml:" + std::to_string(code);
  }
  return "xerces-other:" + std::to_string(code);
}

class CollectingParser final : public XercesDOMParser, public ErrorHandler {
 public:
  CollectingParser(std::vector<Diagnostic>& diagnostics, const std::string& phase)
      : diagnostics_(diagnostics), phase_(phase) {}

  void error(const unsigned int errCode, const XMLCh* const msgDomain,
             const XMLErrorReporter::ErrTypes errType, const XMLCh* const errorText,
             const XMLCh* const systemId, const XMLCh* const, const XMLFileLoc lineNum,
             const XMLFileLoc colNum) override {
    const std::string code = diagnosticCode(msgDomain, errCode);
    // XML 1.0 Fifth Edition section 4.7 makes duplicate notation names a
    // validity error. Xerces exposes XMLErrs::NotationAlreadyExists as warning
    // code 2, so preserve Xerces detection but correct its result severity.
    const bool duplicateNotation = code == "xerces-xml:2";
    diagnostics_.push_back({
        errType == XMLErrorReporter::ErrType_Warning && !duplicateNotation
            ? "warning"
            : "error",
        transcode(errorText), diagnosticPath(transcode(systemId)), code,
        lineNum, colNum, phase_});
  }

  void warning(const SAXParseException&) override {}
  void error(const SAXParseException&) override {}
  void fatalError(const SAXParseException&) override {}
  void resetErrors() override {}

 private:
  std::vector<Diagnostic>& diagnostics_;
  std::string phase_;
};

class ProjectResolver final : public XMLEntityResolver {
 public:
  ProjectResolver(std::vector<Diagnostic>& diagnostics, const std::string& format,
                  const std::string& phase)
      : diagnostics_(diagnostics), format_(format), phase_(phase) {}

  InputSource* resolveEntity(XMLResourceIdentifier* identifier) override {
    const std::string systemId = transcode(identifier->getSystemId());
    const std::string schemaLocation = transcode(identifier->getSchemaLocation());
    const std::string baseUri = transcode(identifier->getBaseURI());
    const std::string reference = !systemId.empty() ? systemId : schemaLocation;
    std::string candidate;
    bool projectQualified = false;
    std::string reason;
    if (!decodeProjectPath(reference, candidate, projectQualified, reason, true)) {
      addBlocked("security-blocked",
                 "Blocked dependency by virtual-project security policy",
                 "xerces:security-reference-blocked");
      return emptyInput("security-blocked");
    }

    if (!projectQualified) {
      std::string base;
      if (normalizeProjectPath(baseUri, base, reason, true)) {
        const std::size_t slash = base.find_last_of('/');
        if (slash != std::string::npos) candidate = base.substr(0, slash + 1) + candidate;
      }
    }

    std::string normalized;
    if (!normalizeResolvedProjectPath(candidate, normalized, reason)) {
      const bool resourceLimit = reason == "path too long" || reason == "path too deep";
      addBlocked(resourceLimit ? "resource-limit" : "security-blocked",
                 resourceLimit
                     ? "Blocked dependency by virtual-project resource limit"
                     : "Blocked dependency by virtual-project security policy",
                 resourceLimit ? "xerces:resource-path-limit"
                               : "xerces:security-reference-blocked");
      return emptyInput(resourceLimit ? "resource-limit" : "security-blocked");
    }
    const auto found = projectFiles.find(normalized);
    if (found == projectFiles.end()) {
      addBlocked(normalized, "Missing project-local dependency",
                 "xerces:missing-project-dependency");
      return emptyInput(normalized);
    }
    return new MemBufInputSource(found->second.data(), found->second.size(), ("project:///" + normalized).c_str(), false);
  }

  bool blocked() const { return blocked_; }

 private:
  InputSource* emptyInput(const std::string& path) {
    static const XMLByte empty[] = {};
    return new MemBufInputSource(empty, 0, ("project:///blocked/" + path).c_str(), false);
  }
  void addBlocked(const std::string& path, const std::string& message,
                  const std::string& code) {
    blocked_ = true;
    diagnostics_.push_back({"error", message + ": " + path, diagnosticPath(path),
                            code, 0, 0, phase_});
  }
  std::vector<Diagnostic>& diagnostics_;
  std::string format_;
  std::string phase_;
  bool blocked_ = false;
};

void configureParser(CollectingParser& parser, ProjectResolver& resolver,
                     const bool schema) {
  parser.setErrorHandler(&parser);
  parser.setXMLEntityResolver(&resolver);
  parser.setDoNamespaces(schema);
  parser.setDoSchema(schema);
  parser.setLoadExternalDTD(true);
  parser.setValidationScheme(XercesDOMParser::Val_Always);
  parser.setValidationSchemaFullChecking(schema);
  parser.setExitOnFirstFatalError(false);
  parser.setValidationConstraintFatal(false);
}

bool isProbeOnlyDiagnostic(const Diagnostic& diagnostic) {
  if (diagnostic.phase != "probe") return false;
  return diagnostic.code == "xerces-validity:2" ||
         diagnostic.code == "xerces-validity:6" ||
         diagnostic.code == "xerces-validity:7" ||
         diagnostic.code == "xerces-validity:16" ||
         diagnostic.code == "xerces-validity:21" ||
         diagnostic.code == "xerces-validity:75";
}

bool hasRetainedError(const std::vector<Diagnostic>& diagnostics) {
  return std::any_of(diagnostics.begin(), diagnostics.end(),
      [](const Diagnostic& diagnostic) {
        return diagnostic.severity == "error" && !isProbeOnlyDiagnostic(diagnostic);
      });
}

std::string generalEntityProbeReferences(Grammar* grammar) {
  std::ostringstream references;
  auto* dtdGrammar = static_cast<DTDGrammar*>(grammar);
  auto entities = dtdGrammar->getEntityEnumerator();
  while (entities.hasMoreElements()) {
    const DTDEntityDecl& entity = entities.nextElement();
    if (!entity.getIsParameter() && !entity.getIsSpecialChar() &&
        (!entity.getNotationName() || !*entity.getNotationName())) {
      references << '&' << transcode(entity.getName()) << ';';
    }
  }
  return references.str();
}

void sanitizeProbeDiagnostics(std::vector<Diagnostic>& diagnostics,
                              const std::string& entryPath) {
  diagnostics.erase(
      std::remove_if(diagnostics.begin(), diagnostics.end(), isProbeOnlyDiagnostic),
      diagnostics.end());
  for (Diagnostic& diagnostic : diagnostics) {
    static const std::string probeName = "__xml_carousel_probe__";
    std::size_t probeNameAt = diagnostic.message.find(probeName);
    while (probeNameAt != std::string::npos) {
      diagnostic.message.replace(probeNameAt, probeName.size(),
                                 "standards-check probe root");
      probeNameAt = diagnostic.message.find(probeName, probeNameAt + 1);
    }
    if (diagnostic.phase == "probe" &&
        diagnostic.file == "__xml_carousel_probe__.xml") {
      diagnostic.file = entryPath;
      diagnostic.line = 0;
      diagnostic.column = 0;
    }
  }
  std::vector<Diagnostic> unique;
  for (const Diagnostic& diagnostic : diagnostics) {
    const bool duplicate = std::any_of(unique.begin(), unique.end(),
        [&diagnostic](const Diagnostic& prior) {
          return prior.severity == diagnostic.severity &&
                 prior.code == diagnostic.code &&
                 prior.message == diagnostic.message &&
                 prior.file == diagnostic.file;
        });
    if (!duplicate) unique.push_back(diagnostic);
  }
  diagnostics.swap(unique);
}

void initialize() {
  if (initialized) return;
  XMLPlatformUtils::Initialize();
  initialized = true;
}

std::string serializeResult(const std::string& attemptId, const std::string& format,
                            const std::string& status, const std::vector<Diagnostic>& diagnostics,
                            double elapsedMs, std::size_t fileCount, std::size_t inputBytes) {
  std::ostringstream out;
  out << "{\"attemptId\":\"" << jsonEscape(attemptId)
      << "\",\"engine\":{\"name\":\"Apache Xerces-C++\",\"version\":\"" XERCES_FULLVERSIONDOT
      << "\"},\"status\":\"" << status << "\",\"diagnostics\":[";
  for (std::size_t index = 0; index < diagnostics.size(); ++index) {
    if (index) out << ',';
    const Diagnostic& diagnostic = diagnostics[index];
    out << "{\"id\":\"" << jsonEscape(attemptId) << ":diagnostic:" << (index + 1)
        << "\",\"severity\":\"" << diagnostic.severity << "\",\"message\":\""
        << jsonEscape(diagnostic.message) << "\",\"code\":\"" << jsonEscape(diagnostic.code)
        << "\",\"source\":\"" << format << "\"";
    if (!diagnostic.file.empty()) out << ",\"fileName\":\"" << jsonEscape(diagnostic.file) << "\"";
    if (diagnostic.line) out << ",\"line\":" << diagnostic.line;
    if (diagnostic.column) out << ",\"column\":" << diagnostic.column;
    if (!diagnostic.phase.empty()) out << ",\"phase\":\"" << jsonEscape(diagnostic.phase) << "\"";
    out << '}';
  }
  out << "],\"metrics\":{\"elapsedMs\":" << elapsedMs << ",\"fileCount\":" << fileCount
      << ",\"inputBytes\":" << inputBytes << "}}";
  return out.str();
}

}  // namespace

extern "C" {

const char* xerces_spike_version() { return XERCES_FULLVERSIONDOT; }

void xerces_spike_reset_project() { projectFiles.clear(); }

int xerces_spike_add_file(const char* path, const unsigned char* bytes, int length) {
  if (!path || !bytes || length < 0) return 0;
  std::string normalized;
  std::string reason;
  if (!normalizeProjectPath(path, normalized, reason)) return 0;
  projectFiles[normalized] = std::vector<unsigned char>(bytes, bytes + length);
  return 1;
}

const char* xerces_spike_run(const char* attemptIdRaw, const char* formatRaw, const char* entryPathRaw) {
  const std::string attemptId = attemptIdRaw ? attemptIdRaw : "invalid-attempt";
  const std::string format = formatRaw ? formatRaw : "";
  const std::string entryRaw = entryPathRaw ? entryPathRaw : "";
  const std::size_t fileCount = projectFiles.size();
  std::size_t inputBytes = 0;
  for (const auto& file : projectFiles) inputBytes += file.second.size();
  const auto started = std::chrono::steady_clock::now();
  std::vector<Diagnostic> diagnostics;
  std::string status = "internal-error";

  try {
    initialize();
    std::string entryPath;
    std::string reason;
    if (!normalizeProjectPath(entryRaw, entryPath, reason)) {
      diagnostics.push_back({"error", "Blocked entry path (" + reason + "): " + entryRaw, entryRaw,
                             "xerces-spike:entry-blocked", 0, 0});
      status = "blocked";
    } else if (format != "xsd" && format != "dtd" && format != "xml") {
      diagnostics.push_back({"error", "Unsupported grammar format: " + format, entryPath,
                             "xerces-spike:unsupported-format", 0, 0});
      status = "unsupported";
    } else {
      const auto entry = projectFiles.find(entryPath);
      if (entry == projectFiles.end()) {
        diagnostics.push_back({"error", "Entry file is not present in the supplied project: " + entryPath,
                               entryPath, "xerces-spike:missing-entry", 0, 0});
        status = "blocked";
      } else {
        const std::string source(entry->second.begin(), entry->second.end());
        if (format == "xsd" && (source.find("minVersion=\"1.1\"") != std::string::npos ||
                                source.find("minVersion='1.1'") != std::string::npos ||
                                source.find("XMLSchema/v1.1") != std::string::npos)) {
          diagnostics.push_back({"error", "This schema declares an XSD 1.1 requirement; the spike supports XSD 1.0.",
                                 entryPath, "xerces-spike:xsd-1.1-unsupported", 0, 0});
          status = "unsupported";
        } else {
          if (format == "xml") {
            CollectingParser parser(diagnostics, "document");
            ProjectResolver resolver(diagnostics, format, "document");
            configureParser(parser, resolver, false);
            MemBufInputSource input(entry->second.data(), entry->second.size(),
                                    ("project:///" + entryPath).c_str(), false);
            parser.parse(input);
            status = resolver.blocked() ? "blocked" : (hasRetainedError(diagnostics) ? "invalid" : "valid");
          } else {
            CollectingParser parser(diagnostics, "grammar");
            ProjectResolver resolver(diagnostics, format, "grammar");
            configureParser(parser, resolver, format == "xsd");
            MemBufInputSource input(entry->second.data(), entry->second.size(),
                                    ("project:///" + entryPath).c_str(), false);
            Grammar* grammar = parser.loadGrammar(
                input, format == "xsd" ? Grammar::SchemaGrammarType : Grammar::DTDGrammarType,
                format == "xsd");
            status = resolver.blocked()
                         ? "blocked"
                         : (!grammar || hasRetainedError(diagnostics) ? "invalid" : "valid");

            if (status == "valid" && format == "dtd") {
              static const std::string probePath = "__xml_carousel_probe__.xml";
              const std::string probe =
                  "<?xml version=\"1.0\"?><!DOCTYPE __xml_carousel_probe__ SYSTEM \"project:///" +
                  entryPath + "\"><__xml_carousel_probe__>" +
                  generalEntityProbeReferences(grammar) +
                  "</__xml_carousel_probe__>";
              CollectingParser probeParser(diagnostics, "probe");
              ProjectResolver probeResolver(diagnostics, format, "probe");
              configureParser(probeParser, probeResolver, false);
              MemBufInputSource probeInput(
                  reinterpret_cast<const XMLByte*>(probe.data()), probe.size(), probePath.c_str(), false);
              probeParser.parse(probeInput);
              status = probeResolver.blocked()
                           ? "blocked"
                           : (hasRetainedError(diagnostics) ? "invalid" : "valid");
            }
          }
        }
      }
    }
  } catch (const XMLException& exception) {
    diagnostics.push_back({"error", transcode(exception.getMessage()), diagnosticPath(entryRaw),
                           "xerces-spike:xml-exception", 0, 0});
  } catch (const std::exception& exception) {
    diagnostics.push_back({"error", exception.what(), diagnosticPath(entryRaw),
                           "xerces-spike:exception", 0, 0});
  } catch (...) {
    if (hasRetainedError(diagnostics)) {
      status = "invalid";
    } else if (format == "xml") {
      diagnostics.push_back({"error", "Xerces aborted while parsing malformed XML input.",
                             diagnosticPath(entryRaw), "xerces-xml:parse-aborted", 0, 0,
                             "document"});
      status = "invalid";
    } else {
      diagnostics.push_back({"error", "Unknown native adapter failure.", diagnosticPath(entryRaw),
                             "xerces-spike:unknown-exception", 0, 0});
    }
  }

  if (format == "dtd") sanitizeProbeDiagnostics(diagnostics, diagnosticPath(entryRaw));

  const double elapsedMs = std::chrono::duration<double, std::milli>(
      std::chrono::steady_clock::now() - started).count();
  lastResult = serializeResult(attemptId, format, status, diagnostics, elapsedMs, fileCount, inputBytes);
  projectFiles.clear();
  return lastResult.c_str();
}

}
