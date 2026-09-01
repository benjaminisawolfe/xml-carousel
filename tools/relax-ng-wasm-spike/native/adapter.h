#ifndef XML_CAROUSEL_RELAX_NG_SPIKE_ADAPTER_H
#define XML_CAROUSEL_RELAX_NG_SPIKE_ADAPTER_H

#include <stddef.h>

#ifdef XML_CAROUSEL_RELAXNG_PRODUCTION
int relaxng_reset(const char *attempt_id);
int relaxng_add_file(const char *path, const unsigned char *bytes, size_t size);
int relaxng_compile(const char *entry_path);
const char *relaxng_engine_version(void);
const char *relaxng_result_json(void);
#else
int rng_reset(int attempt_id);
int rng_add_file(const char *path, const unsigned char *bytes, size_t size);
int rng_compile(const char *entry_path, int parser_mode);
const char *rng_engine_version(void);
const char *rng_result_json(void);
#endif

#endif
