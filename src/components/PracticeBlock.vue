<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{ bank: any[] }>()

const history = ref<{ id: string; correct: boolean; difficulty: any }[]>([])
const current = ref<any>(null)
const answer = ref<any>(null)

function pick() {
  const acc = history.value.length ? history.value.filter((h) => h.correct).length / history.value.length : 0.5
  const desired = acc > 0.8 ? 'hard' : acc < 0.5 ? 'easy' : 'medium'
  const pool = (props.bank as any[]).filter((q) => q.difficulty === desired)
  current.value = pool[Math.floor(Math.random() * pool.length)] || (props.bank as any[])[0]
  answer.value = null
}
function check() {
  const q = current.value
  let ok = false
  if (q.type === 'mcq') ok = answer.value === q.correctIndex
  else if (q.type === 'tf') ok = answer.value === q.correct
  else if (q.type === 'matching') ok = JSON.stringify(answer.value) === JSON.stringify(q.correctMap)
  else ok = !!answer.value
  history.value.unshift({ id: q.id, correct: ok, difficulty: q.difficulty })
}

onMounted(pick)
</script>

<template>
  <div v-if="current">
    <div class="mb-2 small text-secondary">Adaptive difficulty: <span class="badge text-bg-info text-dark">{{ current.difficulty }}</span></div>
    <div class="card mb-2"><div class="card-body">
      <div class="mb-2 fw-semibold">{{ current.prompt }}</div>
      <div v-if="current.type==='mcq'" class="list-group">
        <label v-for="(o,i) in current.options" :key="i" class="list-group-item d-flex gap-2 align-items-center">
          <input class="form-check-input" type="radio" name="p1" :checked="answer===i" @change="answer=i" />
          <span>{{ o }}</span>
        </label>
      </div>
      <div v-else-if="current.type==='tf'" class="d-flex gap-2">
        <button :class="['btn', answer===true?'btn-success':'btn-outline-success']" @click="answer=true">True</button>
        <button :class="['btn', answer===false?'btn-danger':'btn-outline-danger']" @click="answer=false">False</button>
      </div>
    </div></div>
    <div class="d-flex gap-2">
      <button class="btn btn-outline-secondary" @click="pick">Skip</button>
      <button class="btn btn-primary" @click="() => { check(); pick() }">Submit</button>
    </div>
  </div>
</template>
