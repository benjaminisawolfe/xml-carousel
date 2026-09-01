#include <stddef.h>
#include <stdarg.h>
#include "rnl.h"

static int initialized;

const char *rnv_spike_version(void) { return "1.7"; }

int rnv_spike_parse(char *bytes, size_t size) {
    int start;
    if (!initialized) {
        rnl_init();
        initialized = 1;
    }
    start = rnl_s("project:///entry.rnc", bytes, (int) size);
    return start > 0 ? 0 : 1;
}
