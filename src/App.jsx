import { useState, useRef, useEffect } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

function App() {
  const [isListening, setIsListening] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isSimulating, setIsSimulating] = useState(false)
  
  // 1. เพิ่ม State สำหรับเลือกโหมด (Zoom)
  const [freqMode, setFreqMode] = useState('ALL') // ALL, ELEC, MECH

  const [peakFreq, setPeakFreq] = useState(0)
  const [status, setStatus] = useState("STANDBY")
  
  // 2. เพิ่ม State สำหรับคำแนะนำ (Recommendation)
  const [recommendation, setRecommendation] = useState("-")
  
  const [chartData, setChartData] = useState({ labels: [], datasets: [] })
  
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const requestRef = useRef(null)
  const isPausedRef = useRef(false)
  const chartRef = useRef(null)

  const startListening = async () => {
    try {
      if (!audioContextRef.current) {
         const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
         audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
         analyserRef.current = audioContextRef.current.createAnalyser()
         analyserRef.current.fftSize = 4096 // เพิ่มความละเอียดเพื่อการซูมที่ดีขึ้น
         const source = audioContextRef.current.createMediaStreamSource(stream)
         source.connect(analyserRef.current)
      }
      setIsListening(true)
      setIsPaused(false)
      isPausedRef.current = false
      updateChart()
    } catch (err) {
      alert("กรุณากด Allow เพื่อให้ใช้ไมค์ได้")
    }
  }

  const togglePause = () => {
    const newState = !isPausedRef.current
    isPausedRef.current = newState
    setIsPaused(newState)
  }

  const toggleSimulation = () => {
     setIsSimulating(!isSimulating)
     if (!isListening) startListening()
  }

  const saveReport = () => {
      const canvas = document.getElementsByTagName('canvas')[0];
      if (canvas) {
          const image = canvas.toDataURL("image/png");
          const link = document.createElement('a');
          link.download = `Engineering-Report-${new Date().toLocaleTimeString()}.png`;
          link.href = image;
          link.click();
      }
  }

  const updateChart = () => {
    if (!isPausedRef.current) {
        // กำหนดช่วงการแสดงผลตามโหมด (Zoom Logic)
        let maxIndexDisplay = 150; // Default (ALL)
        if (freqMode === 'ELEC') maxIndexDisplay = 40;  // ซูมใกล้ (0-400Hz)
        if (freqMode === 'MECH') maxIndexDisplay = 300; // ซูมไกล (0-3000Hz)

        const labels = []
        const dataPoints = []
        let maxVal = 0
        let maxIndex = 0
        
        let dataArray;
        
        if (isSimulating) {
            dataArray = new Uint8Array(2048).fill(10); 
            for(let k=0; k<200; k++) dataArray[k] = Math.random() * 30; 
            // จำลองเสียงพังที่ความถี่สูง
            dataArray[240] = 200 + (Math.random() * 50); 
            dataArray[239] = 150; dataArray[241] = 150;
        } else {
             if (analyserRef.current) {
                const bufferLength = analyserRef.current.frequencyBinCount
                dataArray = new Uint8Array(bufferLength)
                analyserRef.current.getByteFrequencyData(dataArray)
             } else {
                dataArray = new Uint8Array(2048).fill(0);
             }
        }

        // Loop สร้างกราฟ
        for (let i = 0; i < maxIndexDisplay; i++) {
          // คำนวณ Hz (ปรับตัวคูณตาม fftSize 4096)
          const hz = isSimulating 
             ? Math.round(i * 10.7) 
             : (audioContextRef.current ? Math.round(i * audioContextRef.current.sampleRate / 4096) : i*10);

          labels.push(hz)
          dataPoints.push(dataArray[i])
          
          if (dataArray[i] > maxVal && i > 5) {
            maxVal = dataArray[i]
            maxIndex = i
          }
        }

        // Logic วิเคราะห์ + แนะนำวิธีซ่อม
        const dominant = isSimulating 
            ? Math.round(240 * 10.7)
            : (audioContextRef.current ? Math.round(maxIndex * audioContextRef.current.sampleRate / 4096) : 0);

        if (maxVal > 50) { 
            setPeakFreq(dominant)
            if (dominant >= 45 && dominant <= 110) {
                setStatus("MAINS HUM (NORMAL)")
                setRecommendation("✅ ปกติ: สัญญาณไฟบ้าน/แม่เหล็กทั่วไป")
            } else if (dominant > 2000) {
                setStatus("HIGH FREQ FAULT ⚠️")
                setRecommendation("🔧 คำแนะนำ: ตรวจสอบลูกปืน (Bearings) หรือการเสียดสีของโลหะ")
            } else if (dominant > 1000 && dominant <= 2000) {
                setStatus("MECHANICAL ISSUE")
                setRecommendation("🔧 คำแนะนำ: ตรวจสอบความหลวมของชิ้นส่วน (Looseness)")
            } else {
                setStatus("OPERATING")
                setRecommendation("ℹ️ เครื่องจักรทำงาน (General Operation)")
            }
        } else {
            setStatus("SILENCE")
            setRecommendation("รอสัญญาณเสียง...")
        }

        setChartData({
          labels: labels,
          datasets: [{
            label: 'Signal Strength',
            data: dataPoints,
            borderColor: status.includes('FAULT') ? '#ff3366' : '#00ffcc',
            backgroundColor: (context) => {
                const ctx = context.chart.ctx;
                const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                if (status.includes('FAULT')) {
                    gradient.addColorStop(0, 'rgba(255, 51, 102, 0.5)');
                    gradient.addColorStop(1, 'rgba(255, 51, 102, 0.0)');
                } else {
                    gradient.addColorStop(0, 'rgba(0, 255, 204, 0.5)');
                    gradient.addColorStop(1, 'rgba(0, 255, 204, 0.0)');
                }
                return gradient;
            },
            borderWidth: 2,
            fill: true,
            pointRadius: 0,
            tension: 0.4
          }]
        })
    }
    requestRef.current = requestAnimationFrame(updateChart)
  }

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current)
      if (audioContextRef.current) audioContextRef.current.close()
    }
  }, [])

  // Style ปุ่มเลือกโหมด
  const getModeBtnStyle = (mode) => ({
      background: freqMode === mode ? '#00ffcc' : 'transparent',
      color: freqMode === mode ? '#000' : '#00ffcc',
      border: '1px solid #00ffcc',
      padding: '5px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem'
  })

  return (
    <div style={{ 
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      background: 'radial-gradient(circle at center, #1e1e2f 0%, #000000 100%)',
      color: '#fff', 
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      fontFamily: "'Segoe UI', monospace", overflow: 'hidden'
    }}>
      
      <div style={{ zIndex: 10, textAlign: 'center', width: '100%', maxWidth: '800px', padding: '10px' }}>
        
        <h1 style={{ 
          textShadow: '0 0 20px #00ffcc', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', margin: '0 0 10px 0', letterSpacing: '2px'
        }}>
          ⚡ AI ENGINEERING ASSISTANT
        </h1>
        
        {!isListening && !isSimulating ? (
          <div style={{display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '20px'}}>
            <button onClick={startListening} style={{ 
                padding: '15px 40px', fontSize: '1.2rem', background: 'linear-gradient(90deg, #00ffcc, #0088aa)',
                color: '#000', border: 'none', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold',
                boxShadow: '0 0 30px rgba(0, 255, 204, 0.4)'
            }}>
                ▶ START DIAGNOSIS
            </button>
            <button onClick={toggleSimulation} style={{ 
                padding: '15px 40px', fontSize: '1.2rem', background: 'transparent', border: '2px solid #ffcc00',
                color: '#ffcc00', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold'
            }}>
                ⚠️ SIMULATE FAULT
            </button>
          </div>
        ) : (
          <div>
            {/* โซนแสดงผลตัวเลขและสถานะ */}
             <div style={{ fontSize: '3.5rem', fontWeight: 'bold', textShadow: '0 0 10px rgba(255,255,255,0.5)', lineHeight: 1 }}>
               {peakFreq} <span style={{fontSize: '1.2rem', color: '#888'}}>Hz</span>
             </div>
            
            <div style={{ 
                margin: '10px 0', display: 'inline-block', padding: '5px 20px', borderRadius: '50px', 
                fontSize: '1rem', fontWeight: 'bold',
                color: status.includes('FAULT') ? '#fff' : '#000',
                background: status.includes('FAULT') ? '#ff3366' : (status === 'SILENCE' ? '#333' : '#00ffcc'),
                boxShadow: status.includes('FAULT') ? '0 0 15px #ff3366' : '0 0 15px #00ffcc'
            }}>
                {isSimulating ? "SIMULATION MODE" : status}
            </div>

            {/* 🔥 ใหม่: กล่องคำแนะนำ AI */}
            <div style={{
                background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '10px',
                marginTop: '5px', marginBottom: '15px', borderLeft: '4px solid #fff'
            }}>
                {recommendation}
            </div>

            {/* แถบปุ่มควบคุม */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', alignItems: 'center' }}>
                {/* ปุ่มเลือกโหมด Zoom */}
                <div style={{display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.5)', padding: '5px', borderRadius: '8px'}}>
                    <button onClick={() => setFreqMode('ALL')} style={getModeBtnStyle('ALL')}>ALL</button>
                    <button onClick={() => setFreqMode('ELEC')} style={getModeBtnStyle('ELEC')}>⚡ ELEC</button>
                    <button onClick={() => setFreqMode('MECH')} style={getModeBtnStyle('MECH')}>⚙️ MECH</button>
                </div>

                <div style={{width: '1px', height: '30px', background: '#555'}}></div>

                <button onClick={togglePause} style={{
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.3)',
                    color: '#fff', padding: '5px 15px', borderRadius: '20px', cursor: 'pointer'
                }}>
                    {isPaused ? "▶" : "⏸"}
                </button>

                <button onClick={toggleSimulation} style={{
                    background: isSimulating ? '#ffcc00' : 'rgba(255,255,255,0.1)', border: '1px solid #ffcc00',
                    color: isSimulating ? '#000' : '#ffcc00', padding: '5px 15px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold'
                }}>
                    {isSimulating ? "STOP" : "⚠️ TEST"}
                </button>

                <button onClick={saveReport} style={{
                    background: '#0088aa', border: 'none', color: '#fff', padding: '5px 15px', borderRadius: '20px', cursor: 'pointer'
                }}>
                    💾 SAVE
                </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ 
        width: '95%', maxWidth: '900px', height: '35vh',
        background: 'rgba(0,0,0,0.3)', borderRadius: '20px', border: '1px solid #333',
        padding: '10px', position: 'relative', marginTop: '10px'
      }}>
        {(isListening || isSimulating) && <Line ref={chartRef} data={chartData} options={{ 
            animation: false, maintainAspectRatio: false,
            scales: { 
                y: { min: 0, max: 255, display: false }, 
                x: { display: true, ticks: { color: '#666', font: {size: 10} }, grid: {color: '#333'} } 
            }, 
            plugins: { legend: { display: false } } 
        }} />}
      </div>
      
      <div style={{fontSize: '0.7rem', color: '#666', marginTop: '10px'}}>
        Designed for Industrial Predictive Maintenance
      </div>
    </div>
  )
}

export default App