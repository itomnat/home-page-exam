// Simple JS code runner in a Web Worker
// Receives: { functionName, starter, code, tests }

function deepEqual(a: any, b: any): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

self.onmessage = (ev: MessageEvent) => {
  const { functionName, starter, code, tests } = ev.data as {
    functionName: string
    starter: string
    code: string
    tests: { args: unknown[]; expected: unknown }[]
  }
  let fn: any
  try {
    const full = code && code.trim().length ? code : starter
    const wrapper = `"use strict";\n${full}\n;(${functionName})`
    // eslint-disable-next-line no-new-func
    fn = Function(wrapper)()
  } catch (e) {
    ;(self as any).postMessage({ passed: 0, total: (tests || []).length })
    return
  }
  let passed = 0
  for (const t of tests || []) {
    try {
      const out = fn.apply(null, t.args)
      if (deepEqual(out, t.expected)) passed++
    } catch {}
  }
  ;(self as any).postMessage({ passed, total: (tests || []).length })
}
