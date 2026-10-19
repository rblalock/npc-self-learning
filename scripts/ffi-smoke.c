#include "tactical_air.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void require(int condition, const char *message) {
    if (!condition) {
        fprintf(stderr, "C ABI smoke failed: %s\n", message);
        exit(1);
    }
}

static char *request(TaEngine *engine, const char *json, int expected_ok) {
    char *result = ta_engine_request(engine, json);
    require(result != NULL, "request must return allocated JSON");
    const char *expected = expected_ok ? "\"ok\":true" : "\"ok\":false";
    if (strstr(result, expected) == NULL) {
        fprintf(stderr, "Request: %s\nResponse: %s\n", json ? json : "(null)", result);
        require(0, "unexpected success/error envelope");
    }
    return result;
}

/* Copy an object-valued data field, respecting escaped braces inside strings. */
static char *data_object(const char *json) {
    const char *start = strstr(json, "\"data\":{");
    require(start != NULL, "snapshot response has an object-valued data field");
    start += strlen("\"data\":");
    const char *end = start;
    int depth = 0, in_string = 0, escaped = 0;
    for (; *end; end++) {
        char ch = *end;
        if (in_string) {
            if (escaped) escaped = 0;
            else if (ch == '\\') escaped = 1;
            else if (ch == '"') in_string = 0;
        } else if (ch == '"') in_string = 1;
        else if (ch == '{') depth++;
        else if (ch == '}' && --depth == 0) { end++; break; }
    }
    require(depth == 0 && end > start, "snapshot object terminates");
    size_t length = (size_t)(end - start);
    char *copy = malloc(length + 1);
    require(copy != NULL, "allocate snapshot copy");
    memcpy(copy, start, length);
    copy[length] = '\0';
    return copy;
}

int main(void) {
    const char *config = "{\"seed\":42,\"roles\":[{\"id\":\"vanguard\",\"actions\":[\"rush\",\"hold\"]}],"
        "\"contexts\":[\"arena\"],\"learning_rate\":0.22,\"exploration\":0.16,"
        "\"temperature\":0.3,\"decay\":0.025,\"max_update\":0.16}";

    require(ta_engine_new("{") == NULL, "malformed config is rejected");
    require(ta_last_error() != NULL, "constructor exposes an error");
    require(ta_engine_new(NULL) == NULL, "null config is rejected");
    const char invalid_utf8[] = {(char)0xff, '\0'};
    require(ta_engine_new(invalid_utf8) == NULL, "invalid UTF-8 config is rejected");

    TaEngine *engine = ta_engine_new(config);
    require(engine != NULL, "construct engine");
    require(ta_last_error() == NULL, "success clears last ABI error");
    char *invalid = request(engine, "not json", 0);
    ta_string_free(invalid);
    invalid = request(engine, NULL, 0);
    ta_string_free(invalid);
    invalid = request(engine, invalid_utf8, 0);
    ta_string_free(invalid);
    invalid = request(NULL, "{\"op\":\"inspect\"}", 0);
    ta_string_free(invalid);

    char *choice = request(engine,
        "{\"op\":\"choose\",\"role\":\"vanguard\",\"context\":\"arena\","
        "\"allowed\":[\"hold\"],\"baseline\":false}", 1);
    require(strstr(choice, "\"action\":\"hold\"") != NULL, "legal-action mask selects hold");
    const char *id_start = strstr(choice, "\"decision_id\":");
    require(id_start != NULL, "choice has a decision id");
    char *id_end;
    unsigned long long decision_id = strtoull(id_start + strlen("\"decision_id\":"), &id_end, 10);
    require(id_end > id_start + strlen("\"decision_id\":"), "decision id is numeric");
    char feedback[160];
    int written = snprintf(feedback, sizeof feedback,
        "{\"op\":\"feedback\",\"decision_id\":%llu,\"reward\":0.7,\"observed\":true}", decision_id);
    require(written > 0 && (size_t)written < sizeof feedback, "feedback request fits");
    char *accepted = request(engine, feedback, 1);
    require(strstr(accepted, "\"accepted\":true") != NULL, "observed feedback accepted");
    /* Holding the earlier response across another request exercises independent allocations. */
    require(strstr(choice, "\"action\":\"hold\"") != NULL, "earlier response remains valid");
    ta_string_free(choice);
    ta_string_free(accepted);
    invalid = request(engine, feedback, 0);
    ta_string_free(invalid);

    char *committed = request(engine, "{\"op\":\"commit\"}", 1);
    require(strstr(committed, "\"encounter\":1") != NULL, "commit advances encounter");
    require(strstr(committed, "\"samples\":1") != NULL, "commit counts observed sample");
    require(strstr(committed, "\"queued\":0") != NULL, "commit clears queued feedback");

    char *snapshot = request(engine, "{\"op\":\"snapshot\"}", 1);
    char *object = data_object(snapshot);
    size_t restore_capacity = strlen(object) + 40;
    char *restore_request = malloc(restore_capacity);
    require(restore_request != NULL, "allocate restore request");
    snprintf(restore_request, restore_capacity, "{\"op\":\"restore\",\"snapshot\":%s}", object);
    TaEngine *restored = ta_engine_new(config);
    require(restored != NULL, "construct independent engine");
    char *restored_inspect = request(restored, restore_request, 1);
    require(strcmp(committed, restored_inspect) == 0, "snapshot restores the full inspected policy");
    ta_string_free(restored_inspect);
    ta_string_free(snapshot);
    free(object);
    free(restore_request);

    const char *next_choose = "{\"op\":\"choose\",\"role\":\"vanguard\",\"context\":\"arena\","
        "\"allowed\":[\"rush\",\"hold\"],\"baseline\":false}";
    char *next = request(engine, next_choose, 1);
    char *replayed = request(restored, next_choose, 1);
    require(strcmp(next, replayed) == 0, "snapshot preserves deterministic RNG replay");
    ta_string_free(next);
    ta_string_free(replayed);

    /* Print machine-readable evidence only after the C assertions have passed. */
    puts(committed);
    ta_string_free(committed);
    ta_engine_free(restored);
    ta_engine_free(engine);
    ta_engine_free(NULL);
    ta_string_free(NULL);
    puts("C ABI smoke passed: real shared library, errors, mask, feedback, commit, snapshot/replay, ownership.");
    return 0;
}
