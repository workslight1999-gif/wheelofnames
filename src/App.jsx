import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const COLORS = ['#d4ad4f', '#aa4944', '#3f8277', '#41658f', '#d98350', '#789254', '#bd7589', '#70567f']
const DEFAULT_SPIN_DURATION = 5
const MAX_SPIN_DURATION = 15
const DEFAULT_SPIN_SFX = 'tick'
const SPIN_SFX_OPTIONS = [
  { value: 'tick', label: 'Classic ticks' },
  { value: 'drum', label: 'Drum roll' },
  { value: 'chime', label: 'Soft chimes' },
  { value: 'whoosh', label: 'Whoosh' },
]
const DEFAULT_ENTRIES = [
  { id: 1, name: 'Alex', amount: 1 },
  { id: 2, name: 'Jordan', amount: 1 },
  { id: 3, name: 'Sam', amount: 1 },
  { id: 4, name: 'Taylor', amount: 1 },
  { id: 5, name: 'Morgan', amount: 1 },
  { id: 6, name: 'Riley', amount: 1 },
]

function readSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem('spinclub-state'))
    if (saved && Array.isArray(saved.entries) && saved.entries.length) return saved
  } catch {
    // Start fresh when stored data is unavailable or malformed.
  }
  return { entries: DEFAULT_ENTRIES, mode: 'weight', sound: true, speech: true, theme: 'day', spinDuration: DEFAULT_SPIN_DURATION, spinSfx: DEFAULT_SPIN_SFX }
}

function pointAt(angle, radius) {
  const radians = (angle * Math.PI) / 180
  return { x: 250 + Math.cos(radians) * radius, y: 250 + Math.sin(radians) * radius }
}

function labelColor(hexColor) {
  const channels = hexColor.match(/[a-f\d]{2}/gi).map((channel) => parseInt(channel, 16) / 255)
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.42 ? '#25261f' : '#fffdf7'
}

function sectorPath(startAngle, endAngle) {
  const start = pointAt(startAngle, 238)
  const end = pointAt(endAngle, 238)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M 250 250 L ${start.x} ${start.y} A 238 238 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

function Icon({ name }) {
  if (name === 'cross') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3Z" /></svg>
  if (name === 'sun') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
  if (name === 'moon') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" /></svg>
  if (name === 'sound') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M17 9a5 5 0 0 1 0 6M19.5 6.5a9 9 0 0 1 0 11" /></svg>
  if (name === 'voice') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" /></svg>
  if (name === 'reset') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></svg>
}

function App() {
  const [saved] = useState(readSavedState)
  const [entries, setEntries] = useState(saved.entries)
  const [mode, setMode] = useState(saved.mode ?? 'weight')
  const [sound, setSound] = useState(saved.sound ?? true)
  const [speech, setSpeech] = useState(saved.speech ?? true)
  const [theme, setTheme] = useState(saved.theme ?? 'day')
  const [spinDuration, setSpinDuration] = useState(Math.min(MAX_SPIN_DURATION, Math.max(1, Number(saved.spinDuration) || DEFAULT_SPIN_DURATION)))
  const [spinSfx, setSpinSfx] = useState(saved.spinSfx ?? DEFAULT_SPIN_SFX)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState('')
  const [removedIds, setRemovedIds] = useState([])
  const audioRef = useRef(null)
  const tickRef = useRef(null)
  const spinTimeoutRef = useRef(null)
  const wheelSvgRef = useRef(null)
  const winnerDialogRef = useRef(null)

  const slices = useMemo(() => entries.flatMap((entry) => {
    const name = entry.name.trim()
    if (!name) return []
    const count = mode === 'copies' ? Math.min(50, Math.max(1, Math.floor(Number(entry.amount) || 1))) : 1
    return Array.from({ length: count }, (_, copyIndex) => ({
      id: `${entry.id}-${copyIndex}`,
      name,
      weight: mode === 'weight' ? Math.max(0.1, Number(entry.amount) || 1) : 1,
      color: COLORS[(entries.indexOf(entry) + copyIndex) % COLORS.length],
    }))
  }), [entries, mode])

  useEffect(() => {
    localStorage.setItem('spinclub-state', JSON.stringify({ entries, mode, sound, speech, theme, spinDuration, spinSfx }))
  }, [entries, mode, sound, speech, theme, spinDuration, spinSfx])

  useEffect(() => {
    if (winner && winnerDialogRef.current && !winnerDialogRef.current.open) {
      winnerDialogRef.current.showModal()
    }
  }, [winner])

  useEffect(() => () => {
    window.clearInterval(tickRef.current)
    window.clearTimeout(spinTimeoutRef.current)
    audioRef.current?.close()
  }, [])

  function updateEntry(id, changes) {
    setEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...changes } : entry))
  }

  function addEntry() {
    setEntries((current) => [...current, { id: Date.now(), name: '', amount: 1 }])
  }

  function playTone(frequency, duration = 0.08, wave = 'sine', volume = 0.035) {
    if (!sound) return
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    audioRef.current ??= new AudioContextClass()
    const context = audioRef.current
    if (context.state === 'suspended') context.resume()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = wave
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(volume, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + duration)
  }

  function playNoise(duration = 0.1, volume = 0.025, filterType = 'bandpass', frequency = 1400) {
    if (!sound) return
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    audioRef.current ??= new AudioContextClass()
    const context = audioRef.current
    if (context.state === 'suspended') context.resume()
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    source.buffer = buffer
    filter.type = filterType
    filter.frequency.value = frequency
    gain.gain.setValueAtTime(volume, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(context.destination)
    source.start()
    source.stop(context.currentTime + duration)
  }

  function playSpinSfx(step, totalSteps) {
    const progress = step / Math.max(1, totalSteps)
    if (spinSfx === 'drum') {
      const crescendo = 0.04 + progress * 0.045
      playTone(78 + progress * 105, 0.14, 'triangle', crescendo)
      playNoise(0.1, 0.035 + progress * 0.035, 'bandpass', 1200 + progress * 900)
      if (step % 2 === 0) playNoise(0.055, 0.018 + progress * 0.02, 'highpass', 4200 + progress * 1800)
      if (step % 4 === 0) playTone(58 + progress * 60, 0.2, 'sine', 0.045 + progress * 0.02)
    } else if (spinSfx === 'chime') {
      playTone(440 + progress * 260, 0.12, 'sine', 0.025)
    } else if (spinSfx === 'whoosh') {
      playNoise(0.13, 0.025, 'lowpass', 550 + progress * 900)
    } else {
      playTone(440 + Math.min(step * 16, 480), 0.045, 'square', 0.018)
    }
  }

  function announceWinner(winnerIndex) {
    setWinner(slices[winnerIndex].name)
    setSpinning(false)
    playTone(660, 0.22, 'triangle', 0.06)
    window.setTimeout(() => playTone(880, 0.32, 'triangle', 0.05), 110)
    if (speech && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const announcement = new SpeechSynthesisUtterance(`Congratulations, ${slices[winnerIndex].name}!`)
      announcement.rate = 0.94
      window.speechSynthesis.speak(announcement)
    }
  }

  function winnerAtRotation(rotationValue) {
    const total = slices.reduce((sum, slice) => sum + slice.weight, 0)
    const pointerAngle = ((270 - rotationValue) % 360 + 360) % 360
    const relativeAngle = ((pointerAngle + 90) % 360 + 360) % 360
    let passed = 0
    for (let index = 0; index < slices.length; index += 1) {
      const sliceAngle = (slices[index].weight / total) * 360
      if (relativeAngle < passed + sliceAngle) return index
      passed += sliceAngle
    }
    return slices.length - 1
  }

  function spin() {
    if (spinning || slices.length < 2) return
    let random = Math.random() * slices.reduce((total, slice) => total + slice.weight, 0)
    let winnerIndex = slices.length - 1
    for (let index = 0; index < slices.length; index += 1) {
      random -= slices[index].weight
      if (random < 0) {
        winnerIndex = index
        break
      }
    }

    const total = slices.reduce((sum, slice) => sum + slice.weight, 0)
    let passed = 0
    for (let index = 0; index < winnerIndex; index += 1) passed += slices[index].weight
    const winnerMidpoint = -90 + ((passed + slices[winnerIndex].weight / 2) / total) * 360
    const target = (270 - winnerMidpoint + 360) % 360
    const current = ((rotation % 360) + 360) % 360
    setWinner('')
    setSpinning(true)
    setRotation(rotation + 360 * 7 + ((target - current + 360) % 360))
    let ticks = 0
    const totalTicks = Math.max(1, Math.ceil((spinDuration * 1000) / 170) - 1)
    playSpinSfx(0, totalTicks)
    tickRef.current = window.setInterval(() => {
      ticks += 1
      playSpinSfx(ticks, totalTicks)
      if (ticks >= totalTicks) window.clearInterval(tickRef.current)
    }, 170)
    spinTimeoutRef.current = window.setTimeout(() => {
      window.clearInterval(tickRef.current)
      announceWinner(winnerIndex)
    }, spinDuration * 1000)
  }

  function stopSpin() {
    if (!spinning) return
    window.clearInterval(tickRef.current)
    window.clearTimeout(spinTimeoutRef.current)
    const svg = wheelSvgRef.current
    let currentRotation = rotation
    if (svg && typeof DOMMatrixReadOnly !== 'undefined') {
      const matrix = new DOMMatrixReadOnly(window.getComputedStyle(svg).transform)
      currentRotation = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI)
      svg.style.transition = 'none'
      svg.style.transform = `rotate(${currentRotation}deg)`
      window.requestAnimationFrame(() => {
        svg.style.transition = ''
      })
    }
    setRotation(currentRotation)
    announceWinner(winnerAtRotation(currentRotation))
  }

  function removeWinner() {
    if (!winner) return
    const selected = entries.find((entry) => entry.name.trim() === winner)
    if (selected) {
      setRemovedIds((current) => [...current, selected.id])
      setEntries((current) => current.filter((entry) => entry.id !== selected.id))
    }
    setWinner('')
  }

  function restoreEntries() {
    if (!removedIds.length) return
    setEntries((current) => [...current, ...saved.entries.filter((entry) => removedIds.includes(entry.id) && !current.some((item) => item.id === entry.id))])
    setRemovedIds([])
  }

  const totalWeight = slices.reduce((sum, slice) => sum + slice.weight, 0)
  const segments = slices.map((slice, index) => {
    const passedWeight = slices.slice(0, index).reduce((sum, previous) => sum + previous.weight, 0)
    const start = -90 + (passedWeight / totalWeight) * 360
    const end = start + (slice.weight / totalWeight) * 360
    const midpoint = (start + end) / 2
    const normalizedMidpoint = ((midpoint % 360) + 360) % 360
    const labelAngle = normalizedMidpoint > 90 && normalizedMidpoint < 270 ? midpoint + 180 : midpoint
    const labelPoint = pointAt(midpoint, 152)
    return (
      <g key={slice.id}>
        {slices.length === 1
          ? <circle cx="250" cy="250" r="238" fill={slice.color} />
          : <path d={sectorPath(start, end)} fill={slice.color} stroke="#fffdf7" strokeWidth="2" />}
        {end - start > 2 && (
          <text x={labelPoint.x} y={labelPoint.y} className="wheel-label" style={{ fill: labelColor(slice.color) }} transform={`rotate(${labelAngle} ${labelPoint.x} ${labelPoint.y})`}>{slice.name.length > 17 ? `${slice.name.slice(0, 16)}…` : slice.name}</text>
        )}
      </g>
    )
  })

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Faithful Draw home"><span className="brand-mark"><Icon name="cross" /></span><span>FAITHFUL DRAW</span></a>
        <div className="topbar-actions">
          <button className={`icon-button ${sound ? 'is-on' : ''}`} type="button" onClick={() => setSound((value) => !value)} aria-label={sound ? 'Turn sound off' : 'Turn sound on'} title={sound ? 'Sound on' : 'Sound off'}><Icon name="sound" /></button>
          <button className={`icon-button ${speech ? 'is-on' : ''}`} type="button" onClick={() => setSpeech((value) => !value)} aria-label={speech ? 'Turn voice off' : 'Turn voice on'} title={speech ? 'Voice on' : 'Voice off'}><Icon name="voice" /></button>
          <button className="icon-button theme-toggle" type="button" onClick={() => setTheme((current) => current === 'day' ? 'night' : 'day')} aria-label={`Switch to ${theme === 'day' ? 'night' : 'day'} mode`} title={`${theme === 'day' ? 'Night' : 'Day'} mode`} aria-pressed={theme === 'night'}><Icon name={theme === 'day' ? 'moon' : 'sun'} /></button>
        </div>
      </header>

      <section className="workspace" id="top">
        <aside className="entry-panel">
          <div className="eyebrow"><span className="eyebrow-dot" /> GATHER YOUR NAMES</div>
          <h1>Who’s in<br />the draw?</h1>
          <p className="panel-intro">Add everyone, then trust the Lord with the outcome.</p>

          <div className="mode-block">
            <div className="section-label">CHANCE STYLE</div>
            <div className="mode-switch" role="group" aria-label="Chance style">
              <button type="button" className={mode === 'weight' ? 'selected' : ''} onClick={() => setMode('weight')}>Weight</button>
              <button type="button" className={mode === 'copies' ? 'selected' : ''} onClick={() => setMode('copies')}>Repeat slices</button>
            </div>
            <p className="mode-hint">{mode === 'weight' ? 'Higher weight means a bigger chance.' : 'Give a name extra slices on the wheel.'}</p>
          </div>

          <div className="duration-setting">
            <div className="duration-heading">
              <span className="section-label">SPIN DURATION</span>
              <output htmlFor="spin-duration">{spinDuration}s</output>
            </div>
            <input
              id="spin-duration"
              className="duration-slider"
              type="range"
              min="1"
              max={MAX_SPIN_DURATION}
              step="1"
              value={spinDuration}
              onChange={(event) => setSpinDuration(Number(event.target.value))}
              disabled={spinning}
              aria-label="Spin duration in seconds"
            />
            <p className="mode-hint">Choose how long the wheel spins, up to 15 seconds.</p>
          </div>

          <div className="sfx-setting">
            <label className="duration-heading" htmlFor="spin-sfx">
              <span className="section-label">SPIN SOUND</span>
            </label>
            <select id="spin-sfx" className="sfx-select" value={spinSfx} onChange={(event) => setSpinSfx(event.target.value)} disabled={spinning}>
              {SPIN_SFX_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <p className="mode-hint">Choose the sound used while the wheel spins.</p>
          </div>

          <div className="entries-heading">
            <span className="section-label">NAMES <span className="entry-count">{entries.length}</span></span>
            <button className="text-button" type="button" onClick={restoreEntries} disabled={!removedIds.length}><Icon name="reset" /> Restore</button>
          </div>
          <div className="entry-list">
            {entries.map((entry, index) => (
              <div className="entry-row" key={entry.id}>
                <span className="entry-color" style={{ '--entry-color': COLORS[index % COLORS.length] }} />
                <input className="name-input" aria-label={`Name ${index + 1}`} value={entry.name} placeholder={`Name ${index + 1}`} onChange={(event) => updateEntry(entry.id, { name: event.target.value })} />
                <label className="amount-field"><span className="sr-only">{mode === 'weight' ? 'Weight' : 'Number of slices'} for {entry.name || `name ${index + 1}`}</span><input type="number" min={mode === 'weight' ? '0.1' : '1'} max={mode === 'weight' ? '100' : '50'} step={mode === 'weight' ? '0.1' : '1'} value={entry.amount} onChange={(event) => updateEntry(entry.id, { amount: event.target.value })} /><span>{mode === 'weight' ? '×' : '×'}</span></label>
                <button className="remove-button" type="button" aria-label={`Remove ${entry.name || `name ${index + 1}`}`} onClick={() => setEntries((current) => current.filter((item) => item.id !== entry.id))}>×</button>
              </div>
            ))}
          </div>
          <button className="add-entry" type="button" onClick={addEntry}><span>+</span> Add a name</button>
          <div className="panel-foot"><span className="foot-dot" /> Changes save automatically on this device.</div>
        </aside>

        <section className="wheel-stage" aria-label="Name picker wheel">
          <div className="wheel-heading"><div><div className="eyebrow">PRAY, THEN SPIN</div><h2>Trust in His guidance.</h2></div><span className="slice-total">{slices.length} {slices.length === 1 ? 'SLICE' : 'SLICES'}</span></div>
          <div className="wheel-frame">
            <div className="pointer" aria-hidden="true" />
            <div className={`wheel-outer ${spinning ? 'is-spinning' : ''}`}>
              <svg ref={wheelSvgRef} className="wheel-svg" viewBox="0 0 500 500" role="img" aria-label={`Wheel with ${slices.length} slices`} style={{ '--spin-duration': `${spinDuration}s`, transform: `rotate(${rotation}deg)` }}>
                <circle cx="250" cy="250" r="246" fill="#fffdf7" />
                {segments}
                <circle cx="250" cy="250" r="49" className="wheel-hub-shadow" />
              </svg>
              <button
                className="wheel-hub"
                type="button"
                onClick={spinning ? stopSpin : spin}
                disabled={!spinning && slices.length < 2}
                aria-label={spinning ? 'Stop the wheel' : 'Spin the wheel'}
                title={spinning ? 'Stop the wheel' : 'Spin the wheel'}
              >{spinning ? 'Stop' : 'Start'}</button>
            </div>
            <div className="wheel-shadow" />
          </div>
          {slices.length < 2 && <div className="wheel-actions"><span className="wheel-caption">Add at least two names to spin</span></div>}
        </section>
      </section>
      <footer className="page-footer"><span>FAITHFUL DRAW <span className="footer-separator">/</span> PROVERBS 16:33</span><span>TRUST THE LORD WITH THE OUTCOME</span></footer>
      {winner && (
        <dialog className="winner-dialog" ref={winnerDialogRef} aria-labelledby="winner-title" onClose={() => setWinner('')}>
          <button className="winner-close" type="button" onClick={() => winnerDialogRef.current?.close()} aria-label="Close winner dialog">×</button>
          <div className="winner-dialog-content">
            <span className="winner-cross" aria-hidden="true"><Icon name="cross" /></span>
            <span className="eyebrow">THE WHEEL HAS SPOKEN</span>
            <h2 id="winner-title">{winner}</h2>
            <p className="winner-message">You’re the winner!</p>
            <div className="winner-actions">
              <button className="winner-remove" type="button" onClick={removeWinner}>Remove winner</button>
              <button className="winner-done" type="button" onClick={() => winnerDialogRef.current?.close()}>Done</button>
            </div>
          </div>
        </dialog>
      )}
    </main>
  )
}

export default App
