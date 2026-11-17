typedef unsigned long long u64;

#define MAX_N 100000
#define STABLE_N 32
#define VISUAL_MAX_N 50
#define EXPORT(name) __attribute__((export_name(name)))
#define IMPORT(name) __attribute__((import_module("env"), import_name(name)))
#define COUNT_CMP() (++comparisons)
#define COUNT_MOV() (++moves)

typedef struct { int key; int id; } Record;

static Record records[MAX_N];
static Record merge_buffer[MAX_N];
static Record stable_records[STABLE_N];
static int input_values[MAX_N];
static u64 comparisons;
static u64 moves;
static int visual_mode;
static int visual_requested;
static int selected_algorithm;

IMPORT("emit_frame") void emit_frame(int active, int event_code);
IMPORT("high_res_time") double high_res_time(void);

static int compare_record(Record a, Record b) {
    COUNT_CMP();
    return (a.key > b.key) - (a.key < b.key);
}

static void put(Record *to, Record value) {
    *to = value;
    COUNT_MOV();
}

static void swap_records(Record *a, int i, int j) {
    Record tmp = a[i];
    put(&a[i], a[j]);
    put(&a[j], tmp);
}

static void frame(int active, int event_code) {
    if (visual_mode) emit_frame(active, event_code);
}

static void insertion_range(Record *a, int lo, int hi) {
    int i, j;
    for (i = lo + 1; i <= hi; ++i) {
        Record value = a[i];
        COUNT_MOV();
        j = i;
        while (j > lo && compare_record(a[j - 1], value) > 0) {
            put(&a[j], a[j - 1]);
            --j;
        }
        put(&a[j], value);
        frame(j, 1);
    }
}

static void insertion_sort(Record *a, int n) {
    insertion_range(a, 0, n - 1);
}

static void binary_insertion_sort(Record *a, int n) {
    int i, lo, hi, mid, j;
    for (i = 1; i < n; ++i) {
        Record value = a[i];
        COUNT_MOV();
        lo = 0;
        hi = i;
        while (lo < hi) {
            mid = lo + (hi - lo) / 2;
            if (compare_record(value, a[mid]) < 0) hi = mid;
            else lo = mid + 1;
        }
        for (j = i; j > lo; --j) put(&a[j], a[j - 1]);
        put(&a[lo], value);
        frame(lo, 1);
    }
}

static void shell_sort(Record *a, int n) {
    int gap, i, j;
    for (gap = n / 2; gap > 0; gap /= 2) {
        for (i = gap; i < n; ++i) {
            Record value = a[i];
            COUNT_MOV();
            for (j = i; j >= gap && compare_record(a[j - gap], value) > 0; j -= gap)
                put(&a[j], a[j - gap]);
            put(&a[j], value);
            frame(j, 2);
        }
    }
}

static void bubble_sort(Record *a, int n) {
    int end, i, changed;
    for (end = n - 1; end > 0; --end) {
        changed = 0;
        for (i = 0; i < end; ++i) {
            if (compare_record(a[i], a[i + 1]) > 0) {
                swap_records(a, i, i + 1);
                changed = 1;
                frame(i, 3);
            }
        }
        if (!changed) break;
    }
}

static void quick_sort_range(Record *a, int lo, int hi) {
    while (hi - lo > 16) {
        int mid = lo + (hi - lo) / 2;
        int i = lo, j = hi;
        Record pivot;
        if (compare_record(a[lo], a[mid]) > 0) swap_records(a, lo, mid);
        if (compare_record(a[mid], a[hi]) > 0) swap_records(a, mid, hi);
        if (compare_record(a[lo], a[mid]) > 0) swap_records(a, lo, mid);
        pivot = a[mid];
        COUNT_MOV();
        while (i <= j) {
            while (compare_record(a[i], pivot) < 0) ++i;
            while (compare_record(a[j], pivot) > 0) --j;
            if (i <= j) {
                swap_records(a, i, j);
                frame(i, 4);
                ++i;
                --j;
            }
        }
        if (j - lo < hi - i) {
            if (lo < j) quick_sort_range(a, lo, j);
            lo = i;
        } else {
            if (i < hi) quick_sort_range(a, i, hi);
            hi = j;
        }
    }
    if (lo < hi) insertion_range(a, lo, hi);
}

static void quick_sort(Record *a, int n) {
    if (n > 1) quick_sort_range(a, 0, n - 1);
}

static void selection_sort(Record *a, int n) {
    int i, j, min;
    for (i = 0; i < n - 1; ++i) {
        min = i;
        for (j = i + 1; j < n; ++j)
            if (compare_record(a[j], a[min]) < 0) min = j;
        if (min != i) swap_records(a, i, min);
        frame(i, 5);
    }
}

static void sift_down(Record *a, int root, int end) {
    int child;
    while ((child = root * 2 + 1) <= end) {
        if (child + 1 <= end && compare_record(a[child], a[child + 1]) < 0) ++child;
        if (compare_record(a[root], a[child]) >= 0) return;
        swap_records(a, root, child);
        root = child;
    }
}

static void heap_sort(Record *a, int n) {
    int i;
    for (i = n / 2 - 1; i >= 0; --i) sift_down(a, i, n - 1);
    for (i = n - 1; i > 0; --i) {
        swap_records(a, 0, i);
        sift_down(a, 0, i - 1);
        frame(i, 6);
    }
}

static void merge_range(Record *a, int lo, int mid, int hi) {
    int i = lo, j = mid + 1, k = lo;
    while (i <= mid && j <= hi)
        merge_buffer[k++] = compare_record(a[i], a[j]) <= 0 ? a[i++] : a[j++];
    while (i <= mid) merge_buffer[k++] = a[i++];
    while (j <= hi) merge_buffer[k++] = a[j++];
    for (i = lo; i <= hi; ++i) put(&a[i], merge_buffer[i]);
    frame(mid, 7);
}

static void merge_sort_range(Record *a, int lo, int hi) {
    int mid;
    if (lo >= hi) return;
    mid = lo + (hi - lo) / 2;
    merge_sort_range(a, lo, mid);
    merge_sort_range(a, mid + 1, hi);
    merge_range(a, lo, mid, hi);
}

static void run_algorithm(Record *a, int n, int algorithm) {
    switch (algorithm) {
        case 0: insertion_sort(a, n); break;
        case 1: binary_insertion_sort(a, n); break;
        case 2: shell_sort(a, n); break;
        case 3: bubble_sort(a, n); break;
        case 4: quick_sort(a, n); break;
        case 5: selection_sort(a, n); break;
        case 6: heap_sort(a, n); break;
        case 7: if (n > 1) merge_sort_range(a, 0, n - 1); break;
    }
}

EXPORT("input_ptr") int *input_ptr(void) { return input_values; }
EXPORT("records_ptr") int *records_ptr(void) { return (int *)records; }
EXPORT("stable_ptr") int *stable_ptr(void) { return (int *)stable_records; }
EXPORT("set_algorithm") void set_algorithm(int algorithm) {
    if (algorithm >= 0 && algorithm <= 7) selected_algorithm = algorithm;
}
EXPORT("comparisons") u64 comparisons_value(void) { return comparisons; }
EXPORT("moves") u64 moves_value(void) { return moves; }
static double elapsed_ms;
EXPORT("elapsed_ms") double elapsed_value(void) { return elapsed_ms; }

EXPORT("sort") void sort(int a[], int n) {
    int i;
    double start;
    if (n < 0 || n > MAX_N) return;
    comparisons = 0;
    moves = 0;
    visual_mode = 0;
    for (i = 0; i < n; ++i) {
        records[i].key = a[i];
        records[i].id = i;
    }
    comparisons = 0;
    moves = 0;
    start = high_res_time();
    visual_mode = visual_requested && n <= VISUAL_MAX_N;
    if (visual_mode) frame(-1, 0);
    run_algorithm(records, n, selected_algorithm);
    visual_mode = 0;
    elapsed_ms = high_res_time() - start;
    for (i = 0; i < n; ++i) a[i] = records[i].key;
}

EXPORT("sort_run") int sort_run(int algorithm, int n, int visualize) {
    int i;
    if (n < 0 || n > MAX_N || algorithm < 0 || algorithm > 7) return -1;
    selected_algorithm = algorithm;
    visual_requested = visualize != 0;
    sort(input_values, n);
    visual_requested = 0;
    visual_mode = 0;
    if (visualize && n <= VISUAL_MAX_N) emit_frame(-1, 8);
    for (i = 1; i < n; ++i) if (input_values[i - 1] > input_values[i]) return 0;
    return 1;
}

EXPORT("stability_run") int stability_run(int algorithm) {
    int i;
    if (algorithm < 0 || algorithm > 7) return -1;
    for (i = 0; i < STABLE_N; ++i) {
        stable_records[i].key = i % 3;
        stable_records[i].id = i;
    }
    comparisons = 0;
    moves = 0;
    visual_mode = 0;
    run_algorithm(stable_records, STABLE_N, algorithm);
    for (i = 1; i < STABLE_N; ++i)
        if (stable_records[i - 1].key == stable_records[i].key &&
            stable_records[i - 1].id > stable_records[i].id) return 0;
    return 1;
}
