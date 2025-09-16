<script setup lang="ts">
import { onMounted, reactive, ref, computed, watch } from 'vue'
import QuestionItem from '@/components/QuestionItem.vue'
import QuestionBuilder from '@/components/QuestionBuilder.vue'
import PracticeBlock from '@/components/PracticeBlock.vue'

// Types
type Role = 'student' | 'instructor'

type Difficulty = 'easy' | 'medium' | 'hard'

type QuestionBase = {
  id: string
  prompt: string
  difficulty: Difficulty
  points: number
}

type MCQ = QuestionBase & {
  type: 'mcq'
  options: string[]
  correctIndex: number
}

type TF = QuestionBase & {
  type: 'tf'
  correct: boolean
}

type Essay = QuestionBase & {
  type: 'essay'
}

type Matching = QuestionBase & {
  type: 'matching'
  pairs: { left: string; right: string }[]
  correctMap: number[]
}

type Coding = QuestionBase & {
  type: 'coding'
  functionName: string
  starter: string
  tests: { args: unknown[]; expected: unknown }[]
}

type Question = MCQ | TF | Essay | Matching | Coding

type Exam = {
  id: string
  title: string
  description: string
  durationMinutes: number
  randomizeQuestions: boolean
  randomizeOptions: boolean
  questions: Question[]
}

type Attempt = {
  id: string
  examId: string
  user: string
  startedAt: number
  finishedAt?: number
  score?: number
  answers: Record<string, unknown>
  details?: Record<string, unknown>
  synced?: boolean
}

// Utilities
const uid = () => Math.random().toString(36).slice(2, 10)
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// State
const state = reactive({
  role: null as Role | null,
  userName: '',
  loggedIn: false,
  showLogin: false,
  showWebcam: false,
  stream: null as MediaStream | null,
  isFullscreen: false,
  hiddenEvents: 0,
})

const questionBank = ref<Question[]>([])
const exams = ref<Exam[]>([])
const attempts = ref<Attempt[]>([])

// Current exam session
const currentExamId = ref<string | null>(null)
const currentExam = computed(() => exams.value.find((e) => e.id === currentExamId.value) || null)
const timeLeft = ref(0)
let timerHandle: number | null = null

const currentIndex = ref(0)
const answers = ref<Record<string, unknown>>({})

const isOnline = ref(true)

// Load/Save
function loadLocal() {
  const qb = localStorage.getItem('qb')
  const ex = localStorage.getItem('exams')
  const at = localStorage.getItem('attempts')
  if (qb) questionBank.value = JSON.parse(qb)
  if (ex) exams.value = JSON.parse(ex)
  if (at) attempts.value = JSON.parse(at)
}
function saveLocal() {
  localStorage.setItem('qb', JSON.stringify(questionBank.value))
  localStorage.setItem('exams', JSON.stringify(exams.value))
  localStorage.setItem('attempts', JSON.stringify(attempts.value))
}
watch([questionBank, exams, attempts], saveLocal, { deep: true })

// Auth
function login(role: Role, name: string) {
  state.role = role
  state.userName = name.trim() || 'Guest'
  state.loggedIn = true
  state.showLogin = false
  localStorage.setItem('user', JSON.stringify({ role: state.role, userName: state.userName }))
}
function logout() {
  state.role = null
  state.userName = ''
  state.loggedIn = false
  currentExamId.value = null
  answers.value = {}
  currentIndex.value = 0
  clearTimer()
  localStorage.removeItem('user')
}

// Exam controls
function startExam(examId: string) {
  const ex = exams.value.find((e) => e.id === examId)
  if (!ex) return
  currentExamId.value = examId
  currentIndex.value = 0
  answers.value = {}
  prepareExamForSession(ex)
  timeLeft.value = Math.floor(ex.durationMinutes * 60)
  startTimer()
  const att: Attempt = {
    id: uid(),
    examId: examId,
    user: state.userName,
    startedAt: Date.now(),
    answers: {},
    synced: navigator.onLine,
  }
  attempts.value.unshift(att)
}

function prepareExamForSession(ex: Exam) {
  if (ex.randomizeQuestions) {
    ex.questions = shuffle(ex.questions)
  }
  if (ex.randomizeOptions) {
    ex.questions = ex.questions.map((q) => {
      if (q.type === 'mcq') {
        const indices = q.options.map((_, i) => i)
        const shuffled = shuffle(indices)
        const newOptions = shuffled.map((i) => q.options[i])
        const newCorrect = shuffled.indexOf(q.correctIndex)
        return { ...q, options: newOptions, correctIndex: newCorrect }
      }
      if (q.type === 'matching') {
        const rights = q.pairs.map((p) => p.right)
        const idx = rights.map((_, i) => i)
        const shuffled = shuffle(idx)
        const newRights = shuffled.map((i) => rights[i])
        const inv: number[] = []
        shuffled.forEach((newIdx, originalIdx) => (inv[newIdx] = originalIdx))
        const newMap = q.correctMap.map((m) => inv[m])
        const newPairs = q.pairs.map((p, i) => ({ left: p.left, right: newRights[i] }))
        return { ...q, pairs: newPairs, correctMap: newMap }
      }
      return q
    })
  }
}

function clearTimer() {
  if (timerHandle != null) {
    clearInterval(timerHandle)
    timerHandle = null
  }
}
function startTimer() {
  clearTimer()
  timerHandle = window.setInterval(() => {
    timeLeft.value = clamp(timeLeft.value - 1, 0, 10_000_000)
    if (timeLeft.value === 0) {
      clearTimer()
      submitExam(true)
    }
  }, 1000)
}

function submitExam(auto = false) {
  const ex = currentExam.value
  if (!ex) return
  const att = attempts.value.find((a) => a.examId === ex.id && !a.finishedAt && a.user === state.userName)
  if (!att) return

  const { score, details } = grade(ex, answers.value)
  att.finishedAt = Date.now()
  att.score = score
  att.answers = { ...answers.value }
  att.details = details
  att.synced = navigator.onLine

  currentExamId.value = null
  clearTimer()

  computeBadges()
}

function grade(exam: Exam, ans: Record<string, unknown>) {
  let total = 0
  let obtained = 0
  const details: Record<string, unknown> = {}
  for (const q of exam.questions) {
    total += q.points
    if (q.type === 'mcq') {
      const picked = ans[q.id] as number | undefined
      const ok = picked === q.correctIndex
      if (ok) obtained += q.points
      details[q.id] = { correct: ok, picked }
    } else if (q.type === 'tf') {
      const picked = ans[q.id] as boolean | undefined
      const ok = picked === q.correct
      if (ok) obtained += q.points
      details[q.id] = { correct: ok, picked }
    } else if (q.type === 'matching') {
      const picked = (ans[q.id] as number[]) || []
      const ok = JSON.stringify(picked) === JSON.stringify(q.correctMap)
      if (ok) obtained += q.points
      details[q.id] = { correct: ok, picked }
    } else if (q.type === 'essay') {
      details[q.id] = { graded: false, note: 'Manual grading required' }
    } else if (q.type === 'coding') {
      const result = ans[q.id] as { passed: number; total: number }
      const fraction = result ? result.passed / Math.max(1, result.total) : 0
      const pts = Math.round(q.points * fraction)
      obtained += pts
      details[q.id] = { tests: result }
    }
  }
  return { score: Math.max(0, obtained / Math.max(1, total)) * 100, details }
}

// Badges & leaderboard
const badges = ref<string[]>([])
function computeBadges() {
  const last = attempts.value.find((a) => a.user === state.userName)
  if (!last) return
  const earned: string[] = []
  if ((last.score || 0) >= 90) earned.push('High Achiever')
  if (attempts.value.filter((a) => a.user === state.userName).length >= 5) earned.push('Consistency Star')
  if ((last.finishedAt || 0) - last.startedAt < 0.5 * 60 * 1000) earned.push('Speedster')
  badges.value = earned
}

const leaderboard = computed(() => {
  const map = new Map<string, number[]>()
  for (const a of attempts.value.filter((x) => x.score != null)) {
    const arr = map.get(a.user) || []
    arr.push(a.score as number)
    map.set(a.user, arr)
  }
  return Array.from(map.entries())
    .map(([user, scores]) => ({ user, average: Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) }))
    .sort((a, b) => b.average - a.average)
    .slice(0, 10)
})

// Voice input (essay) provided within QuestionItem

// Coding worker
let worker: Worker | null = null
function ensureWorker() {
  if (!worker) {
    worker = new Worker(new URL('./workers/codeRunner.ts', import.meta.url), { type: 'module' })
  }
}
async function runCode(question: Coding, code: string) {
  ensureWorker()
  return new Promise<{ passed: number; total: number }>((resolve) => {
    worker!.onmessage = (ev) => resolve(ev.data)
    worker!.postMessage({ functionName: question.functionName, starter: question.starter, code, tests: question.tests })
  })
}

// Anti-cheating
function requestFullscreen() {
  const el = document.documentElement as any
  if (el.requestFullscreen) el.requestFullscreen()
  state.isFullscreen = true
}
function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  state.isFullscreen = false
}

function startWebcam() {
  navigator.mediaDevices
    .getUserMedia({ video: true, audio: false })
    .then((s) => {
      state.stream = s
      state.showWebcam = true
      const v = document.getElementById('proctor-video') as HTMLVideoElement | null
      if (v) v.srcObject = s
    })
    .catch(() => {
      state.showWebcam = false
    })
}
function stopWebcam() {
  state.stream?.getTracks().forEach((t) => t.stop())
  state.stream = null
  state.showWebcam = false
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) state.hiddenEvents++
})

// Offline sync
function syncAttempts() {
  attempts.value.forEach((a) => {
    if (!a.synced) a.synced = true
  })
}

// Seed data
function seed() {
  if (questionBank.value.length) return
  const q1: MCQ = {
    id: uid(),
    type: 'mcq',
    prompt: 'Which data structure uses FIFO order?',
    options: ['Stack', 'Queue', 'Tree', 'Graph'],
    correctIndex: 1,
    difficulty: 'easy',
    points: 5,
  }
  const q2: TF = {
    id: uid(),
    type: 'tf',
    prompt: 'HTTP is a stateless protocol.',
    correct: true,
    difficulty: 'easy',
    points: 5,
  }
  const q3: Matching = {
    id: uid(),
    type: 'matching',
    prompt: 'Match language to domain',
    pairs: [
      { left: 'SQL', right: 'Databases' },
      { left: 'CSS', right: 'Styling' },
      { left: 'Python', right: 'General Purpose' },
    ],
    correctMap: [0, 1, 2],
    difficulty: 'medium',
    points: 10,
  }
  const q4: Essay = {
    id: uid(),
    type: 'essay',
    prompt: 'Explain event loop in JavaScript concisely.',
    difficulty: 'hard',
    points: 10,
  }
  const q5: Coding = {
    id: uid(),
    type: 'coding',
    prompt: 'Implement a function sum(a, b) that returns a + b.',
    functionName: 'sum',
    starter: 'function sum(a, b) {\n  return 0\n}',
    tests: [
      { args: [1, 2], expected: 3 },
      { args: [-1, 1], expected: 0 },
      { args: [10, 5], expected: 15 },
    ],
    difficulty: 'easy',
    points: 20,
  }
  questionBank.value.push(q1, q2, q3, q4, q5)
  const ex: Exam = {
    id: uid(),
    title: 'Sample Certification Exam',
    description: 'Mixed questions with timer and auto-grading.',
    durationMinutes: 5,
    randomizeQuestions: true,
    randomizeOptions: true,
    questions: [q1, q2, q3, q4, q5],
  }
  exams.value.push(ex)
}

onMounted(() => {
  loadLocal()
  const u = localStorage.getItem('user')
  if (u) {
    const parsed = JSON.parse(u)
    state.role = parsed.role
    state.userName = parsed.userName
    state.loggedIn = true
  }
  seed()
  isOnline.value = navigator.onLine
  window.addEventListener('online', () => {
    isOnline.value = true
    syncAttempts()
  })
  window.addEventListener('offline', () => (isOnline.value = false))
})

// Instructor: create exam
const newExam = reactive<Exam>({
  id: '',
  title: '',
  description: '',
  durationMinutes: 30,
  randomizeQuestions: true,
  randomizeOptions: true,
  questions: [],
})

function addQuestionToNewExam(q: Question) {
  newExam.questions.push(q)
}
function createExam() {
  if (!newExam.title || newExam.questions.length === 0) return
  const clone: Exam = { ...newExam, id: uid(), questions: newExam.questions.map((q) => ({ ...q })) }
  exams.value.unshift(clone)
  Object.assign(newExam, { id: '', title: '', description: '', durationMinutes: 30, randomizeQuestions: true, randomizeOptions: true, questions: [] })
}
</script>

<template>
  <!-- Navbar -->
  <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom sticky-top" style="backdrop-filter: blur(6px)">
    <div class="container">
      <a class="navbar-brand fw-bold text-primary" href="#hero">ExamPro</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav" aria-controls="nav" aria-expanded="false" aria-label="Toggle navigation">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="nav">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item"><a class="nav-link" href="#features">Features</a></li>
          <li class="nav-item"><a class="nav-link" href="#exams">Exams</a></li>
          <li class="nav-item"><a class="nav-link" href="#practice">Practice</a></li>
          <li class="nav-item"><a class="nav-link" href="#dashboard">Dashboard</a></li>
        </ul>
        <div class="d-flex align-items-center gap-2">
          <span v-if="state.loggedIn" class="text-secondary small">Hi, {{ state.userName }} ({{ state.role }})</span>
          <button v-if="!state.loggedIn" class="btn btn-primary btn-sm" @click="state.showLogin = true">Sign In</button>
          <button v-else class="btn btn-outline-secondary btn-sm" @click="logout">Sign Out</button>
        </div>
      </div>
    </div>
  </nav>

  <!-- Hero -->
  <section id="hero" class="py-5 bg-light position-relative overflow-hidden">
    <div class="container">
      <div class="row align-items-center g-4">
        <div class="col-12 col-lg-6">
          <h1 class="display-5 fw-bold mb-3">Professional Exam Platform</h1>
          <p class="lead text-secondary mb-4">
            Secure, timed, and auto-graded exams. Practice mode, analytics, adaptive testing, and AI‑assisted proctoring.
          </p>
          <div class="d-flex gap-2">
            <a href="#exams" class="btn btn-primary">Start Exam</a>
            <a href="#practice" class="btn btn-outline-primary">Practice Mode</a>
          </div>
          <div class="d-flex gap-3 align-items-center mt-4 small text-secondary">
            <div class="d-flex align-items-center gap-2"><span class="badge text-bg-success">New</span> AI Proctoring</div>
            <div>Offline Ready</div>
            <div>Leaderboard & Badges</div>
          </div>
        </div>
        <div class="col-12 col-lg-6">
          <!-- Carousel -->
          <div id="heroCarousel" class="carousel slide shadow-sm rounded overflow-hidden" data-bs-ride="carousel">
            <div class="carousel-inner">
              <div class="carousel-item active p-4 bg-white">
                <h3 class="h5">Timed Exams with Auto‑Submit</h3>
                <p class="mb-0 text-secondary">Reliable countdown timer ensures fairness and auto‑submits when time runs out.</p>
              </div>
              <div class="carousel-item p-4 bg-white">
                <h3 class="h5">Question Bank & Difficulty Levels</h3>
                <p class="mb-0 text-secondary">Create once, reuse anywhere. Tag by difficulty for adaptive assessments.</p>
              </div>
              <div class="carousel-item p-4 bg-white">
                <h3 class="h5">Anti‑Cheating & Proctoring</h3>
                <p class="mb-0 text-secondary">Fullscreen lock, focus tracking, and optional webcam monitoring.</p>
              </div>
            </div>
            <button class="carousel-control-prev" type="button" data-bs-target="#heroCarousel" data-bs-slide="prev">
              <span class="carousel-control-prev-icon" aria-hidden="true"></span>
              <span class="visually-hidden">Previous</span>
            </button>
            <button class="carousel-control-next" type="button" data-bs-target="#heroCarousel" data-bs-slide="next">
              <span class="carousel-control-next-icon" aria-hidden="true"></span>
              <span class="visually-hidden">Next</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Feature Cards -->
  <section id="features" class="py-5">
    <div class="container">
      <h2 class="h3 fw-bold mb-4">Core & Advanced Features</h2>
      <div class="row g-4">
        <div class="col-12 col-md-6 col-lg-3" v-for="card in [
          {title:'User Authentication',desc:'Secure login for students & instructors'},
          {title:'Exam Creation',desc:'MCQ, True/False, Essay, Matching, Coding'},
          {title:'Timed & Randomized',desc:'Countdown timer + shuffled questions'},
          {title:'Automatic Grading',desc:'Instant results for objective questions'},
          {title:'Result Dashboard',desc:'Scores & class performance'},
          {title:'Analytics',desc:'Insights & trends'},
          {title:'Anti‑Cheating',desc:'Proctoring & fullscreen lock'},
          {title:'Offline & Adaptive',desc:'Works offline with adaptive testing'},
        ]" :key="card.title">
          <div class="card h-100 shadow-sm">
            <div class="card-body">
              <h3 class="h6 fw-semibold">{{ card.title }}</h3>
              <p class="text-secondary small mb-0">{{ card.desc }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Exams Section -->
  <section id="exams" class="py-5 bg-light">
    <div class="container">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h3 fw-bold mb-0">Exams</h2>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" @click="requestFullscreen" v-if="!state.isFullscreen">Enter Fullscreen</button>
          <button class="btn btn-outline-secondary btn-sm" @click="exitFullscreen" v-else>Exit Fullscreen</button>
          <button class="btn btn-outline-secondary btn-sm" @click="state.showWebcam ? stopWebcam() : startWebcam()">{{ state.showWebcam ? 'Stop' : 'Start' }} Proctor Cam</button>
        </div>
      </div>

      <div class="row g-4">
        <div class="col-12 col-lg-8">
          <div v-if="!currentExam">
            <div class="list-group">
              <a v-for="ex in exams" :key="ex.id" href="#" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                <div>
                  <div class="fw-semibold">{{ ex.title }}</div>
                  <div class="small text-secondary">{{ ex.description }}</div>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span class="badge text-bg-primary">{{ ex.durationMinutes }} min</span>
                  <button class="btn btn-sm btn-primary" :disabled="!state.loggedIn || state.role==='instructor'" @click.prevent="startExam(ex.id)">Start</button>
                </div>
              </a>
            </div>
            <div v-if="!state.loggedIn" class="alert alert-warning mt-3">Sign in to start an exam.</div>
          </div>

          <div v-else>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="h5 mb-0">{{ currentExam!.title }}</h3>
              <div class="badge text-bg-dark">⏳ {{ Math.floor(timeLeft/60) }}:{{ (timeLeft%60).toString().padStart(2,'0') }}</div>
            </div>
            <div class="progress mb-3" role="progressbar" aria-valuemin="0" aria-valuemax="100">
              <div class="progress-bar" :style="{width: (((currentIndex+1)/currentExam!.questions.length)*100).toFixed(0)+'%'}"></div>
            </div>

            <div class="card mb-3">
              <div class="card-body">
                <div class="mb-2 small text-secondary">Question {{ currentIndex+1 }} of {{ currentExam!.questions.length }}</div>
                <QuestionItem :q="currentExam!.questions[currentIndex]" v-model="answers[currentExam!.questions[currentIndex].id]" @run-code="runCode" />
              </div>
            </div>

            <div class="d-flex justify-content-between">
              <button class="btn btn-outline-secondary" :disabled="currentIndex===0" @click="currentIndex--">Previous</button>
              <div class="d-flex gap-2">
                <button class="btn btn-outline-primary" :disabled="currentIndex===currentExam!.questions.length-1" @click="currentIndex++">Next</button>
                <button class="btn btn-primary" @click="submitExam(false)">Submit</button>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-4">
          <div class="card h-100">
            <div class="card-body">
              <h3 class="h6">Proctoring & Status</h3>
              <p class="small text-secondary mb-1">Focus lost events: <span class="fw-semibold">{{ state.hiddenEvents }}</span></p>
              <p class="small text-secondary">Network: <span class="badge" :class="isOnline ? 'text-bg-success' : 'text-bg-secondary'">{{ isOnline ? 'Online' : 'Offline' }}</span></p>
              <div v-if="state.showWebcam" class="ratio ratio-16x9 rounded overflow-hidden border">
                <video id="proctor-video" autoplay muted playsinline></video>
              </div>
              <p v-else class="small text-secondary">Webcam is off.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Practice & Adaptive -->
  <section id="practice" class="py-5">
    <div class="container">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h2 class="h3 fw-bold mb-0">Practice Mode</h2>
        <a href="#exams" class="btn btn-outline-primary btn-sm">Go to Exams</a>
      </div>
      <div class="row g-4">
        <div class="col-12 col-lg-7">
          <div class="card h-100">
            <div class="card-body">
              <h3 class="h6">Quick Practice</h3>
              <p class="small text-secondary">Adaptive engine adjusts difficulty from your performance.</p>
              <PracticeBlock :bank="questionBank" />
            </div>
          </div>
        </div>
        <div class="col-12 col-lg-5">
          <div class="card h-100">
            <div class="card-body">
              <h3 class="h6">Leaderboard</h3>
              <ol class="mb-3">
                <li v-for="row in leaderboard" :key="row.user" class="d-flex justify-content-between">
                  <span>{{ row.user }}</span>
                  <span class="fw-semibold">{{ row.average }}%</span>
                </li>
              </ol>
              <h3 class="h6">Badges</h3>
              <div class="d-flex flex-wrap gap-2">
                <span v-for="b in badges" :key="b" class="badge text-bg-warning text-dark">{{ b }}</span>
                <span v-if="!badges.length" class="text-secondary small">No badges yet — complete an exam!</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Instructor: Create Exam -->
  <section v-if="state.loggedIn && state.role==='instructor'" class="py-5 bg-light">
    <div class="container">
      <h2 class="h3 fw-bold mb-3">Create Exam</h2>
      <div class="row g-4">
        <div class="col-12 col-lg-6">
          <div class="card">
            <div class="card-body">
              <div class="row g-3">
                <div class="col-12">
                  <label class="form-label">Title</label>
                  <input v-model="newExam.title" placeholder="Midterm Assessment" class="form-control" />
                </div>
                <div class="col-12">
                  <label class="form-label">Description</label>
                  <textarea v-model="newExam.description" rows="2" class="form-control" placeholder="Brief summary"></textarea>
                </div>
                <div class="col-6">
                  <label class="form-label">Duration (min)</label>
                  <input type="number" v-model.number="newExam.durationMinutes" min="1" class="form-control" />
                </div>
                <div class="col-6 d-flex align-items-end gap-3">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" v-model="newExam.randomizeQuestions" id="rq" />
                    <label class="form-check-label" for="rq">Shuffle Questions</label>
                  </div>
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" v-model="newExam.randomizeOptions" id="ro" />
                    <label class="form-check-label" for="ro">Shuffle Options</label>
                  </div>
                </div>
              </div>
              <hr />
              <div class="d-flex justify-content-between align-items-center">
                <div class="text-secondary small">{{ newExam.questions.length }} questions</div>
                <button class="btn btn-primary" :disabled="!newExam.title || newExam.questions.length===0" @click="createExam">Create Exam</button>
              </div>
            </div>
          </div>
        </div>
        <div class="col-12 col-lg-6">
          <QuestionBuilder @add="addQuestionToNewExam" />
        </div>
      </div>
    </div>
  </section>

  <!-- Dashboard / Results -->
  <section id="dashboard" class="py-5">
    <div class="container">
      <h2 class="h3 fw-bold mb-3">Results Dashboard</h2>
      <div class="table-responsive">
        <table class="table align-middle">
          <thead>
            <tr>
              <th>Student</th>
              <th>Exam</th>
              <th>Score</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in attempts" :key="a.id">
              <td>{{ a.user }}</td>
              <td>{{ exams.find((e)=>e.id===a.examId)?.title || '—' }}</td>
              <td>
                <span v-if="a.score!=null" class="fw-semibold">{{ Math.round(a.score) }}%</span>
                <span v-else class="text-secondary">—</span>
              </td>
              <td>{{ new Date(a.startedAt).toLocaleString() }}</td>
              <td>{{ a.finishedAt ? new Date(a.finishedAt).toLocaleString() : '—' }}</td>
              <td>
                <span class="badge" :class="a.synced ? 'text-bg-success' : 'text-bg-secondary'">{{ a.synced ? 'Synced' : 'Queued' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="py-4 border-top bg-white">
    <div class="container d-flex flex-column flex-md-row justify-content-between align-items-center gap-3">
      <div class="small text-secondary">© {{ new Date().getFullYear() }} ExamPro. All rights reserved.</div>
      <div class="d-flex gap-3 small">
        <a href="#hero" class="link-secondary text-decoration-none">Home</a>
        <a href="#features" class="link-secondary text-decoration-none">Features</a>
        <a href="#dashboard" class="link-secondary text-decoration-none">Dashboard</a>
      </div>
    </div>
  </footer>

  <!-- Auth Modal -->
  <div class="modal" tabindex="-1" :class="{ show: state.showLogin }" style="display: block" v-if="state.showLogin">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Sign In</h5>
          <button type="button" class="btn-close" @click="state.showLogin=false"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Name</label>
            <input class="form-control" v-model="state.userName" placeholder="Your name" />
          </div>
          <div class="mb-3">
            <label class="form-label">Role</label>
            <select class="form-select" v-model="state.role">
              <option value="student">Student</option>
              <option value="instructor">Instructor</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="state.showLogin=false">Cancel</button>
          <button class="btn btn-primary" :disabled="!state.role || !state.userName" @click="login(state.role as Role, state.userName)">Continue</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
:root { --brand: #0d6efd; }
body, .navbar-brand { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
section { scroll-margin-top: 80px; }
.carousel-item { min-height: 180px; }
</style>
