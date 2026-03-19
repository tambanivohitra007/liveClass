"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BIG_O_ITEMS = [
    { code: "return arr[0];", complexity: "O(1)", description: "Accessing array by index" },
    { code: "return hashMap.get(key);", complexity: "O(1)", description: "Hash table lookup" },
    { code: "for (i = 0; i < n; i++)\n  sum += arr[i];", complexity: "O(n)", description: "Single loop through array" },
    { code: "for (i = 0; i < n; i++)\n  if (arr[i] === target)\n    return i;", complexity: "O(n)", description: "Linear search" },
    { code: "for (i = 0; i < n; i++)\n  for (j = 0; j < n; j++)\n    matrix[i][j] = 0;", complexity: "O(n²)", description: "Nested loops" },
    { code: "for (i = 0; i < n; i++)\n  for (j = i+1; j < n; j++)\n    if (arr[i]+arr[j]===t)\n      return true;", complexity: "O(n²)", description: "Brute-force two sum" },
    { code: "while (n > 1)\n  n = n / 2;", complexity: "O(log n)", description: "Halving the input" },
    { code: "lo=0; hi=n-1;\nwhile (lo <= hi) {\n  mid = (lo+hi)/2;\n  if (arr[mid]===t) return;\n  else if (arr[mid]<t) lo=mid+1;\n  else hi=mid-1;\n}", complexity: "O(log n)", description: "Binary search" },
    { code: "arr.sort();\n// built-in sort", complexity: "O(n log n)", description: "Sorting an array" },
    { code: "mergeSort(arr);", complexity: "O(n log n)", description: "Merge sort" },
    { code: "for (i = 0; i < n; i++)\n  for (j = 0; j < n; j++)\n    for (k = 0; k < n; k++)\n      C[i][j] += A[i][k]*B[k][j];", complexity: "O(n³)", description: "Matrix multiplication (naive)" },
    { code: "function fib(n) {\n  if (n<=1) return n;\n  return fib(n-1)+fib(n-2);\n}", complexity: "O(2ⁿ)", description: "Recursive Fibonacci" },
    { code: "// Generate all subsets\nfor (i=0; i<(1<<n); i++)\n  processSubset(i);", complexity: "O(2ⁿ)", description: "All subsets enumeration" },
    { code: "// Generate all permutations\nof n elements", complexity: "O(n!)", description: "All permutations" },
    { code: "for (i=0; i<n; i++)\n  binarySearch(arr, target);", complexity: "O(n log n)", description: "Binary search in a loop" },
    { code: "stack.push(x);\nstack.pop();", complexity: "O(1)", description: "Stack push/pop" },
];
const COMPLEXITIES = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)", "O(n³)", "O(2ⁿ)", "O(n!)"];
function generateRounds(config, roundCount, timeLimitSec) {
    const shuffled = [...BIG_O_ITEMS].sort(() => Math.random() - 0.5);
    const rounds = [];
    for (let i = 0; i < roundCount; i++) {
        const item = shuffled[i % shuffled.length];
        const options = COMPLEXITIES.map((c) => ({ value: c, label: c }));
        rounds.push({
            type: "identify_complexity",
            prompt: item.code,
            answer: item.complexity,
            timeLimitSec,
            meta: {
                description: item.description,
                options,
                inputType: "mcq",
            },
        });
    }
    return rounds;
}
function checkAnswer(submission, round) {
    // Normalize: remove spaces, handle unicode superscripts
    const normalize = (s) => s.replace(/\s/g, "").replace(/²/g, "^2").replace(/³/g, "^3").replace(/ⁿ/g, "^n").toLowerCase();
    return normalize(submission) === normalize(round.answer);
}
const bigOModule = {
    generateRounds: generateRounds,
    checkAnswer,
};
exports.default = bigOModule;
//# sourceMappingURL=bigO.js.map