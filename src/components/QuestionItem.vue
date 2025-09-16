<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{ q: any; modelValue?: any; runCode?: (q: any, code: string) => Promise<{ passed: number; total: number }> }>()
const emit = defineEmits<{ 'update:modelValue': [any] }>()

const local = ref<any>(props.modelValue)
watch(
  () => props.modelValue,
  (v) => (local.value = v),
  { immediate: true }
)
function update(v: any) {
  local.value = v
  emit('update:modelValue', v)
}

// Voice input
const recognitionSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
let recognition: any = null
function startVoiceInput() {
  const Ctor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
  if (!Ctor) return
  recognition = new Ctor()
  recognition.lang = 'en-US'
  recognition.interimResults = true
  recognition.continuous = false
  recognition.onresult = (e: any) => {
    const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join(' ')
    const prev = (local.value as string) || ''
    update((prev + ' ' + transcript).trim())
  }
  recognition.start()
}
function stopVoice() {
  if (recognition) recognition.stop()
}

// Coding
const code = ref('')
const codingResult = ref<{ passed: number; total: number } | null>(null)
watch(
  () => props.q,
  () => {
    codingResult.value = null
    code.value = props.q?.starter || ''
  },
  { immediate: true }
)
async function runTests() {
  if (!props.runCode) return
  const res = await props.runCode(props.q, code.value)
  codingResult.value = res
  update(res)
}
</script>

<template>
  <div>
    <h4 class="h6 fw-semibold mb-2">{{ props.q.prompt }}</h4>

    <div v-if="props.q.type==='mcq'" class="list-group">
      <label v-for="(opt, idx) in props.q.options" :key="idx" class="list-group-item d-flex gap-2 align-items-center">
        <input class="form-check-input" type="radio" :name="props.q.id" :checked="local===idx" @change="update(idx)" />
        <span>{{ opt }}</span>
      </label>
    </div>

    <div v-else-if="props.q.type==='tf'" class="d-flex gap-3">
      <button :class="['btn', local===true?'btn-success':'btn-outline-success']" @click="update(true)">True</button>
      <button :class="['btn', local===false?'btn-danger':'btn-outline-danger']" @click="update(false)">False</button>
    </div>

    <div v-else-if="props.q.type==='essay'">
      <textarea class="form-control" rows="4" :value="local || ''" @input="(e:any)=>update(e.target.value)"></textarea>
      <div v-if="recognitionSupported" class="mt-2 d-flex gap-2">
        <button class="btn btn-outline-primary btn-sm" @click="startVoiceInput">Start Voice Input</button>
        <button class="btn btn-outline-secondary btn-sm" @click="stopVoice">Stop</button>
      </div>
    </div>

    <div v-else-if="props.q.type==='matching'" class="row g-2">
      <div v-for="(p,i) in props.q.pairs" :key="i" class="col-12 d-flex align-items-center gap-2">
        <span class="badge text-bg-light text-dark">{{ p.left }}</span>
        <select class="form-select" :value="(local && local[i] != null ? local[i] : '')" @change="(e:any)=>{ const arr=Array.isArray(local)?[...local]:[]; arr[i]=Number(e.target.value); update(arr) }">
          <option value="" disabled>Match…</option>
          <option v-for="(pp,j) in props.q.pairs" :key="j" :value="j">{{ pp.right }}</option>
        </select>
      </div>
    </div>

    <div v-else-if="props.q.type==='coding'">
      <textarea class="form-control font-monospace" rows="7" v-model="code"></textarea>
      <div class="d-flex align-items-center gap-2 mt-2">
        <button class="btn btn-primary" @click="runTests">Run Tests</button>
        <span v-if="codingResult" class="small text-secondary">Passed {{ codingResult.passed }} / {{ codingResult.total }}</span>
      </div>
    </div>
  </div>
</template>
