<script setup lang="ts">
import { ref } from 'vue'

type Difficulty = 'easy' | 'medium' | 'hard'

type Question = any

const emit = defineEmits<{ add: [Question] }>()

const type = ref<'mcq' | 'tf' | 'essay' | 'matching' | 'coding'>('mcq')
const prompt = ref('')
const difficulty = ref<Difficulty>('easy')
const points = ref(5)

const options = ref<string[]>(['', '', '', ''])
const correctIndex = ref(0)
const tfCorrect = ref(true)
const pairs = ref<{ left: string; right: string }[]>([
  { left: '', right: '' },
  { left: '', right: '' },
])
const correctMap = ref<number[]>([0, 1])

const functionName = ref('solution')
const starter = ref('function solution(input) {\n  return input;\n}')
const tests = ref<{ args: unknown[]; expected: unknown }[]>([
  { args: [1], expected: 1 },
])

function uid() { return Math.random().toString(36).slice(2, 10) }

function add() {
  if (!prompt.value) return
  let q: Question
  if (type.value === 'mcq') {
    if (!options.value.every((o) => o.trim().length)) return
    q = { id: uid(), type: 'mcq', prompt: prompt.value, options: options.value.slice(), correctIndex: correctIndex.value, difficulty: difficulty.value, points: points.value }
  } else if (type.value === 'tf') {
    q = { id: uid(), type: 'tf', prompt: prompt.value, correct: tfCorrect.value, difficulty: difficulty.value, points: points.value }
  } else if (type.value === 'essay') {
    q = { id: uid(), type: 'essay', prompt: prompt.value, difficulty: difficulty.value, points: points.value }
  } else if (type.value === 'matching') {
    if (!pairs.value.every((p) => p.left && p.right)) return
    q = { id: uid(), type: 'matching', prompt: prompt.value, pairs: pairs.value.slice(), correctMap: correctMap.value.slice(), difficulty: difficulty.value, points: points.value }
  } else {
    q = { id: uid(), type: 'coding', prompt: prompt.value, functionName: functionName.value, starter: starter.value, tests: tests.value.slice(), difficulty: difficulty.value, points: points.value }
  }
  emit('add', q)
  prompt.value = ''
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h3 class="h6">Add Question</h3>
      <div class="row g-3">
        <div class="col-12">
          <label class="form-label">Type</label>
          <select class="form-select" v-model="type">
            <option value="mcq">Multiple Choice</option>
            <option value="tf">True / False</option>
            <option value="essay">Essay</option>
            <option value="matching">Matching</option>
            <option value="coding">Coding</option>
          </select>
        </div>
        <div class="col-12">
          <label class="form-label">Prompt</label>
          <textarea class="form-control" rows="2" v-model="prompt"></textarea>
        </div>
        <div class="col-6">
          <label class="form-label">Difficulty</label>
          <select class="form-select" v-model="difficulty">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div class="col-6">
          <label class="form-label">Points</label>
          <input type="number" class="form-control" v-model.number="points" min="1" />
        </div>

        <div v-if="type==='mcq'" class="col-12">
          <label class="form-label">Options</label>
          <div v-for="(_, i) in options" :key="i" class="input-group mb-2">
            <span class="input-group-text">{{ String.fromCharCode(65 + i) }}</span>
            <input class="form-control" v-model="options[i]" />
            <span class="input-group-text">
              <input class="form-check-input mt-0" type="radio" name="correct" :checked="correctIndex===i" @change="correctIndex=i" />
            </span>
          </div>
        </div>

        <div v-else-if="type==='tf'" class="col-12 d-flex gap-3">
          <div class="form-check">
            <input class="form-check-input" type="radio" name="tfc" :checked="tfCorrect===true" @change="tfCorrect=true" />
            <label class="form-check-label">True</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="radio" name="tfc" :checked="tfCorrect===false" @change="tfCorrect=false" />
            <label class="form-check-label">False</label>
          </div>
        </div>

        <div v-else-if="type==='matching'" class="col-12">
          <div v-for="(p,i) in pairs" :key="i" class="row g-2 align-items-center mb-2">
            <div class="col-5"><input class="form-control" placeholder="Left" v-model="p.left" /></div>
            <div class="col-5"><input class="form-control" placeholder="Right" v-model="p.right" /></div>
            <div class="col-2 text-center"><span class="badge text-bg-light text-dark">{{ i+1 }}</span></div>
          </div>
        </div>

        <div v-else-if="type==='coding'" class="col-12">
          <label class="form-label">Function Name</label>
          <input class="form-control mb-2" v-model="functionName" />
          <label class="form-label">Starter Code</label>
          <textarea class="form-control font-monospace mb-2" rows="5" v-model="starter"></textarea>
          <label class="form-label">Tests</label>
          <div v-for="(t,i) in tests" :key="i" class="input-group mb-2">
            <span class="input-group-text">Args (JSON)</span>
            <input class="form-control" :value="JSON.stringify(t.args)" @input="(e:any)=>{ try{ tests[i].args = JSON.parse(e.target.value) } catch{} }" />
            <span class="input-group-text">Expected</span>
            <input class="form-control" :value="JSON.stringify(t.expected)" @input="(e:any)=>{ try{ tests[i].expected = JSON.parse(e.target.value) } catch{} }" />
          </div>
        </div>

        <div class="col-12 d-flex justify-content-end">
          <button class="btn btn-primary" @click="add">Add Question</button>
        </div>
      </div>
    </div>
  </div>
</template>
