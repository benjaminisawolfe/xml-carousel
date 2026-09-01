#ifndef XML_CAROUSEL_RELAX_NG_SPIKE_ADAPTER_H
#define XML_CAROUSEL_RELAX_NG_SPIKE_ADAPTER_H

#include <stddef.h>

int rng_reset(int attempt_id);
int rng_add_file(const char *path, const unsigned char *bytes, size_t size);
int rng_compile(const char *entry_path, int parser_mode);
const char *rng_engine_version(void);
const char *rng_result_json(void);

#endif
