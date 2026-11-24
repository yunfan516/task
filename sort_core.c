/*
 * 选题 58：内部排序算法可视化与性能对比平台 —— C 语言核心源码
 * 说明：
 *   1. 八种内部排序算法、关键字比较/移动次数统计、耗时统计与稳定性检测全部在此文件实现。
 *   2. 通过 Zig C 编译器编译为 sort_core.wasm，供浏览器网页端直接调用。
 */

typedef unsigned long long u64;

#define MAX_N 100000          /* 性能测试支持的最大数据规模 */
#define STABLE_N 32           /* 稳定性测试固定使用的记录条数 */
#define VISUAL_MAX_N 50       /* 动画演示允许的最大数据规模（防止帧数过多卡顿） */
#define EXPORT(name) __attribute__((export_name(name)))                       /* 导出函数给 JS/WASM 调用 */
#define IMPORT(name) __attribute__((import_module("env"), import_name(name))) /* 从宿主环境(浏览器)导入函数 */
#define COUNT_CMP() (++comparisons) /* 统计关键字比较次数（不含循环边界比较） */
#define COUNT_MOV() (++moves)       /* 统计元素赋值/移动次数（含临时保存与写回） */

/*
 * 排序记录结构体：
 *   key：用于比较大小的关键字
 *   id ：元素排序前的原始下标，用于在 key 相等时验证排序算法是否稳定
 */
typedef struct { int key; int id; } Record;

static Record records[MAX_N];        /* 实际参与排序的记录数组 */
static Record merge_buffer[MAX_N];   /* 归并排序预分配的静态辅助数组，避免递归中频繁申请内存 */
static Record stable_records[STABLE_N]; /* 稳定性检测专用数组 */
static int input_values[MAX_N];      /* 外部写入与读出整型数据的共享缓冲区 */
static u64 comparisons;              /* 累计关键字比较次数 */
static u64 moves;                    /* 累计元素移动次数 */
static int visual_mode;              /* 当前是否实际处于动画帧回调模式（1=开启，0=关闭） */
static int visual_requested;         /* 外部是否请求开启动画 */
static int selected_algorithm;       /* 当前选中的排序算法编号（0~7） */

/* 由浏览器宿主提供的外部函数：emit_frame 发送一帧动画状态；high_res_time 获取高精度毫秒时间 */
IMPORT("emit_frame") void emit_frame(int active, int event_code);
IMPORT("high_res_time") double high_res_time(void);

/* 比较两条记录的 key，并自动累计比较次数 */
static int compare_record(Record a, Record b) {
    COUNT_CMP();
    return (a.key > b.key) - (a.key < b.key);
}

/* 将一条记录写入目标位置，并自动累计移动次数 */
static void put(Record *to, Record value) {
    *to = value;
    COUNT_MOV();
}

/* 交换数组 a 中下标 i 和 j 的两条记录（1 次临时保存 + 2 次 put 共计 2 次统计；按 put 计移动） */
static void swap_records(Record *a, int i, int j) {
    Record tmp = a[i];
    put(&a[i], a[j]);
    put(&a[j], tmp);
}

/* 若处于动画模式，向前端发送当前高亮下标 active 与事件类型 event_code */
static void frame(int active, int event_code) {
    if (visual_mode) emit_frame(active, event_code);
}

/*
 * 区间直接插入排序（对 a[lo..hi] 排序）
 * 特点：稳定；最好 O(n)，最坏/平均 O(n^2)；同时被快排小区间优化复用
 */
static void insertion_range(Record *a, int lo, int hi) {
    int i, j;
    for (i = lo + 1; i <= hi; ++i) {
        Record value = a[i]; /* 取出待插入元素 */
        COUNT_MOV();
        j = i;
        while (j > lo && compare_record(a[j - 1], value) > 0) {
            put(&a[j], a[j - 1]); /* 大于 value 的元素后移 */
            --j;
        }
        put(&a[j], value); /* 插入到有序区正确位置 */
        frame(j, 1);
    }
}

/* 0. 直接插入排序 */
static void insertion_sort(Record *a, int n) {
    insertion_range(a, 0, n - 1);
}

/*
 * 1. 折半插入排序
 * 特点：稳定；用二分查找确定插入位置，比较次数降为 O(n log n)，但元素后移次数仍为 O(n^2)
 */
static void binary_insertion_sort(Record *a, int n) {
    int i, lo, hi, mid, j;
    for (i = 1; i < n; ++i) {
        Record value = a[i];
        COUNT_MOV();
        lo = 0;
        hi = i;
        /* 二分查找第一个大于 value 的位置 lo（保持相等元素相对顺序，确保稳定） */
        while (lo < hi) {
            mid = lo + (hi - lo) / 2;
            if (compare_record(value, a[mid]) < 0) hi = mid;
            else lo = mid + 1;
        }
        for (j = i; j > lo; --j) put(&a[j], a[j - 1]); /* 统一后移 */
        put(&a[lo], value);
        frame(lo, 1);
    }
}

/*
 * 2. 希尔排序（采用 gap = n/2, gap /= 2 增量序列）
 * 特点：不稳定；通过逐步缩小增量让数组宏观有序，突破 O(n^2) 瓶颈
 */
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

/*
 * 3. 冒泡排序（带提前终止标志）
 * 特点：稳定；若某趟遍历未发生任何交换（changed == 0），说明已有序，直接结束（正序仅需 n-1 次比较）
 */
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

/*
 * 快速排序核心区间实现（含三项经典工程优化）：
 *   1. 三数取中选枢轴：对 lo、mid、hi 三处元素排序并取 a[mid] 为枢轴，防止正序/逆序退化为 O(n^2)
 *   2. 小区间切换：当子数组长度 <= 16 时跳出循环，改用直接插入排序收尾
 *   3. 尾递归优化：每次只递归较短的子区间，较长子区间通过更新 lo/hi 在 while 循环内处理，栈深控制在 O(log n)
 */
static void quick_sort_range(Record *a, int lo, int hi) {
    while (hi - lo > 16) {
        int mid = lo + (hi - lo) / 2;
        int i = lo, j = hi;
        Record pivot;
        /* 三数取中：确保 a[lo] <= a[mid] <= a[hi] */
        if (compare_record(a[lo], a[mid]) > 0) swap_records(a, lo, mid);
        if (compare_record(a[mid], a[hi]) > 0) swap_records(a, mid, hi);
        if (compare_record(a[lo], a[mid]) > 0) swap_records(a, lo, mid);
        pivot = a[mid];
        COUNT_MOV();
        /* 双向扫描分区 */
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
        /* 优先递归较短分区，另一半用循环继续处理以防栈溢出 */
        if (j - lo < hi - i) {
            if (lo < j) quick_sort_range(a, lo, j);
            lo = i;
        } else {
            if (i < hi) quick_sort_range(a, i, hi);
            hi = j;
        }
    }
    if (lo < hi) insertion_range(a, lo, hi); /* 小区间用直接插入排序收尾 */
}

/* 4. 快速排序（不稳定；平均 O(n log n)） */
static void quick_sort(Record *a, int n) {
    if (n > 1) quick_sort_range(a, 0, n - 1);
}

/*
 * 5. 简单选择排序
 * 特点：不稳定；每趟从无序区选出最小元素放到前面，比较次数固定为 n(n-1)/2，但移动次数极少
 */
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

/* 大顶堆向下调整（sift down）：将下标 root 的节点下沉到满足大顶堆性质的位置，范围为 [0..end] */
static void sift_down(Record *a, int root, int end) {
    int child;
    while ((child = root * 2 + 1) <= end) { /* 左孩子下标为 2*root + 1 */
        if (child + 1 <= end && compare_record(a[child], a[child + 1]) < 0) ++child; /* 选较大的孩子 */
        if (compare_record(a[root], a[child]) >= 0) return; /* 已满足大顶堆性质，结束 */
        swap_records(a, root, child);
        root = child;
    }
}

/*
 * 6. 堆排序
 * 特点：不稳定；最坏、平均、最好时间复杂度均为 O(n log n)，原地排序，空间复杂度 O(1)
 */
static void heap_sort(Record *a, int n) {
    int i;
    /* 从最后一个非叶子节点 (n/2 - 1) 开始自底向上建大顶堆 */
    for (i = n / 2 - 1; i >= 0; --i) sift_down(a, i, n - 1);
    /* 依次将堆顶最大值交换到数组末尾，并重新调整剩余元素为大顶堆 */
    for (i = n - 1; i > 0; --i) {
        swap_records(a, 0, i);
        sift_down(a, 0, i - 1);
        frame(i, 6);
    }
}

/* 二路归并：将有序区间 a[lo..mid] 与 a[mid+1..hi] 合并到 merge_buffer 后写回 a */
static void merge_range(Record *a, int lo, int mid, int hi) {
    int i = lo, j = mid + 1, k = lo;
    /* 使用 <= 保证两关键字相等时优先取左半区元素，这是归并排序稳定的关键 */
    while (i <= mid && j <= hi)
        merge_buffer[k++] = compare_record(a[i], a[j]) <= 0 ? a[i++] : a[j++];
    while (i <= mid) merge_buffer[k++] = a[i++];
    while (j <= hi) merge_buffer[k++] = a[j++];
    for (i = lo; i <= hi; ++i) put(&a[i], merge_buffer[i]);
    frame(mid, 7);
}

/* 7. 归并排序（稳定；时间复杂度恒为 O(n log n)，需要 O(n) 辅助空间） */
static void merge_sort_range(Record *a, int lo, int hi) {
    int mid;
    if (lo >= hi) return;
    mid = lo + (hi - lo) / 2;
    merge_sort_range(a, lo, mid);
    merge_sort_range(a, mid + 1, hi);
    merge_range(a, lo, mid, hi);
}

/* 根据算法编号分发执行对应的排序函数 */
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

/* 导出给宿主环境访问的指针与指标查询接口 */
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

/*
 * 统一排序入口：void sort(int a[], int n)
 * 流程：将整型数组封装为带原始下标 id 的 Record -> 计时并执行所选排序 -> 写回结果到 a[]
 */
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
    visual_mode = visual_requested && n <= VISUAL_MAX_N; /* 仅当请求动画且 n <= 50 时回调帧 */
    if (visual_mode) frame(-1, 0);
    run_algorithm(records, n, selected_algorithm);
    visual_mode = 0;
    elapsed_ms = high_res_time() - start;
    for (i = 0; i < n; ++i) a[i] = records[i].key;
}

/*
 * 网页端/测试端调用的便捷封装：
 *   设置算法与动画开关 -> 对 input_values[0..n-1] 排序 -> 校验结果是否非降序（1=有序，0=无序，-1=参数非法）
 */
EXPORT("sort_run") int sort_run(int algorithm, int n, int visualize) {
    int i;
    if (n < 0 || n > MAX_N || algorithm < 0 || algorithm > 7) return -1;
    selected_algorithm = algorithm;
    visual_requested = visualize != 0;
    sort(input_values, n);
    visual_requested = 0;
    visual_mode = 0;
    if (visualize && n <= VISUAL_MAX_N) emit_frame(-1, 8); /* 发送结束帧 */
    for (i = 1; i < n; ++i) if (input_values[i - 1] > input_values[i]) return 0;
    return 1;
}

/*
 * 稳定性专项检测：
 *   构造 32 条重复关键字记录 (key = i % 3, id = i) 并排序；
 *   若排序后存在相邻记录 key 相等且 id 递减，则判定为不稳定（返回 0），否则稳定（返回 1）。
 */
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
