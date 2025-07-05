// Elementos DOM
const video = document.getElementById('video');
const btnStart = document.getElementById('btn-start');
const btnDetect = document.getElementById('btn-detect');
const emotionResult = document.getElementById('emotion-result');
const fingersResult = document.getElementById('fingers-result');
const traitsResult = document.getElementById('traits-result');
const canvasHands = document.getElementById('canvas-hands');
const ctxHands = canvasHands.getContext('2d');
const canvasFace = document.getElementById('canvas-face');
const ctxFace = canvasFace.getContext('2d');

// Variables de estado
let handTracker = null;
let detectionActive = false;
let cameraActive = false;
let faceDetectionInterval = null;
let handDetectionInterval = null;
let stream = null;
let handFingers = { left: 0, right: 0 };

// Variables para conexión serial
let serialPort = null;
let writer = null;
let isArduinoRequested = false;

// Escala del canvas
window.canvasScale = { x: 1, y: 1 };

// Traducciones de emociones
const emotionTranslations = {
    neutral: 'Neutral',
    happy: 'Feliz',
    sad: 'Triste',
    angry: 'Enojado',
    fearful: 'Temeroso',
    disgusted: 'Disgustado',
    surprised: 'Sorprendido'
};

// Iniciar/Desactivar cámara
btnStart.addEventListener('click', async () => {
    if (cameraActive) {
        stopDetection();
        stream?.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
        btnStart.textContent = 'Activar Cámara';
        cameraActive = false;
        btnDetect.disabled = true;
        return;
    }

    try {
        btnStart.disabled = true;
        btnStart.textContent = 'Iniciando cámara...';
        
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { min: 320, ideal: 640, max: 1920 },
                height: { min: 240, ideal: 480, max: 1080 },
                frameRate: { ideal: 30, min: 15 }
            }
        });
        
        cameraActive = true;
        video.srcObject = stream;
        
        await new Promise(resolve => {
            const onLoaded = () => {
                const videoWidth = video.videoWidth;
                const videoHeight = video.videoHeight;
                
                document.querySelector('.video-container').style.aspectRatio = `${videoWidth}/${videoHeight}`;
                [canvasHands, canvasFace].forEach(canvas => {
                    canvas.width = videoWidth;
                    canvas.height = videoHeight;
                });
                resolve();
            };
            
            video.readyState >= 4 ? onLoaded() : video.addEventListener('loadeddata', onLoaded, { once: true });
        });
        
        try {
            await video.play();
        } catch {
            video.muted = true;
            await video.play();
        }
        
        btnStart.disabled = false;
        btnStart.textContent = 'Desactivar Cámara';
        btnDetect.disabled = false;
        
    } catch (error) {
        console.error('Error de cámara:', error);
        btnStart.disabled = false;
        btnStart.textContent = 'Activar Cámara';
        cameraActive = false;
        
        const messages = {
            NotAllowedError: 'Permiso denegado',
            NotFoundError: 'No se encontró cámara',
            OverconstrainedError: 'Configuración no compatible',
            NotReadableError: 'Cámara en uso'
        };
        
        alert(`Error al acceder a la cámara: ${messages[error.name] || error.message}`);
    }
});

// Control de detección
btnDetect.addEventListener('click', async () => {
    if (!cameraActive) {
        alert('Activa la cámara primero');
        return;
    }
    
    if (detectionActive) {
        stopDetection();
        btnDetect.textContent = 'Iniciar Detección';
    } else {
        await startDetection();
        btnDetect.textContent = 'Detener Detección';
    }
});

// Botón para iniciar conexión con Arduino
document.getElementById('btn-connect').addEventListener('click', () => {
    isArduinoRequested = true;
    alert('Cuando se detecte un rostro, se te pedirá seleccionar el puerto Arduino');
});

// Función para conectar con Arduino
async function connectToArduino() {
    try {
        if (!navigator.serial) {
            throw new Error('Web Serial API no soportada en este navegador');
        }
        
        serialPort = await navigator.serial.requestPort();
        await serialPort.open({ baudRate: 9600 });
        writer = serialPort.writable.getWriter();
        
        console.log('Conectado a Arduino');
        return true;
    } catch (error) {
        console.error('Error al conectar con Arduino:', error);
        
        // Informar al usuario
        if (error.message.includes('Web Serial API')) {
            alert('Tu navegador no soporta conexión serial. Usa Chrome o Edge.');
        } else {
            alert('Selecciona el puerto correcto en el selector');
        }
        
        return false;
    }
}

// Variables para manejar el envío de datos
let lastSendTime = 0;
const sendInterval = 500;
let isConnecting = false;

// Función para enviar datos a Arduino
async function sendToArduino(data) {
    // 1. Verificar si el usuario quiere conectar Arduino
    if (!isArduinoRequested) return;
    
    // 2. Controlar frecuencia de envío
    const now = Date.now();
    if (now - lastSendTime < sendInterval) return;
    lastSendTime = now;
    
    // 3. Conectar si es necesario
    if (!writer) {
        const success = await connectToArduino();
        if (!success) {
            isArduinoRequested = false; // Dejar de intentar si falla
            return;
        }
    }
    
    // 4. Enviar datos
    try {
        const encoder = new TextEncoder();
        const output = `${data.emocion}\n${data.edad}\n${data.genero}\n${data.mano_izquierda}\n${data.mano_derecha}\n`;
        await writer.write(encoder.encode(output));
    } catch (error) {
        console.error('Error enviando datos a Arduino:', error);
        writer = null;
        serialPort = null;
    }
}

// Detener detección
function stopDetection() {
    if (!detectionActive) return;
    
    detectionActive = false;
    clearInterval(faceDetectionInterval);
    clearInterval(handDetectionInterval);
    
    ctxHands.clearRect(0, 0, canvasHands.width, canvasHands.height);
    ctxFace.clearRect(0, 0, canvasFace.width, canvasFace.height);
    
    emotionResult.textContent = '-';
    fingersResult.textContent = '-';
    traitsResult.textContent = '-';
    window.canvasScale = { x: 1, y: 1 };
}

// Ajustar dimensiones
function handleResize() {
    const container = document.querySelector('.video-container');
    if (!container || !video.videoWidth) return;
    
    const { videoWidth, videoHeight } = video;
    
    // Mantener relación de aspecto
    container.style.aspectRatio = `${videoWidth}/${videoHeight}`;
    
    // Calcular factor de escala solo para rostro (manos ya están normalizadas)
    const scaleX = container.clientWidth / videoWidth;
    const scaleY = container.clientHeight / videoHeight;
    
    window.canvasScale = { x: scaleX, y: scaleY };
    
    [canvasHands, canvasFace].forEach(canvas => {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    });
    
    if (detectionActive) {
        ctxHands.clearRect(0, 0, canvasHands.width, canvasHands.height);
        ctxFace.clearRect(0, 0, canvasFace.width, canvasFace.height);
        
        // Redibujar inmediatamente
        setTimeout(() => {
            if (handDetectionInterval) handTracker.send({ image: video });
            detectFace();
        }, 50);
    }
}

handleResize();

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);
document.addEventListener('fullscreenchange', handleResize);
document.addEventListener('webkitfullscreenchange', handleResize);
document.addEventListener('mozfullscreenchange', handleResize);

// Evento de carga del video
const onLoaded = () => {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    document.querySelector('.video-container').style.aspectRatio = `${videoWidth}/${videoHeight}`;
    handleResize(); // Forzar redimensionamiento inicial
    resolve();
};

// Manejo de pantalla completa
function toggleFullscreen() {
  const container = document.querySelector('.video-container');
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.error('Error al entrar en pantalla completa:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

// Iniciar detección
async function startDetection() {
    if (detectionActive) return;
    
    detectionActive = true;
    btnDetect.disabled = true;
    btnDetect.textContent = 'Cargando modelos...';
    
    try {
        await Promise.all([
            faceapi.nets.faceLandmark68TinyNet.loadFromUri('./models'),
            faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
            faceapi.nets.faceExpressionNet.loadFromUri('./models'),
            faceapi.nets.ageGenderNet.loadFromUri('./models')
        ]);

        handTracker = new window.Hands({
            locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        
        await handTracker.setOptions({
            maxNumHands: 2,
            modelComplexity: 0,
            minDetectionConfidence: 0.6
        });
        
        handTracker.onResults(processHands);
        
        faceDetectionInterval = setInterval(detectFace, 300);
        handDetectionInterval = setInterval(() => {
            video.readyState >= 2 && handTracker.send({ image: video });
        }, 150);
        
        btnDetect.disabled = false;
        
    } catch (error) {
        console.error('Error inicializando detectores:', error);
        stopDetection();
        btnDetect.textContent = 'Iniciar Detección';
        
        const message = error.message.includes('404') 
            ? 'Modelos no encontrados. Verifica la carpeta "models"' 
            : 'Ver consola para detalles';
        
        alert(`Error al iniciar detección: ${message}`);
    }
}

// Detección facial
async function detectFace() {
    if (!detectionActive || !video.videoWidth) return;
    
    try {
        const detection = await faceapi.detectSingleFace(
            video, 
            new faceapi.TinyFaceDetectorOptions()
        )
        .withFaceLandmarks('tiny') 
        .withFaceExpressions()
        .withAgeAndGender();
        
        ctxFace.clearRect(0, 0, canvasFace.width, canvasFace.height);
        
        if (detection) {
            const scale = window.canvasScale || { x: 1, y: 1 };
            const { x, y, width, height } = detection.detection.box;

            ctxFace.strokeStyle = '#f08b36';
            ctxFace.lineWidth = 3;
            ctxFace.strokeRect(x * scale.x, y * scale.y, width * scale.x, height * scale.y);
            
            if (detection.landmarks) {
                try {
                    drawFaceLandmarks(detection.landmarks);
                } catch {}
            }
            
            const expressions = detection.expressions;
            const dominantEmotion = Object.keys(expressions).reduce(
                (a, b) => expressions[a] > expressions[b] ? a : b
            );
            
            emotionResult.textContent = `${emotionTranslations[dominantEmotion] || dominantEmotion} (${Math.round(expressions[dominantEmotion] * 100)}%)`;
            traitsResult.textContent = `${Math.round(detection.age)} años, ${detection.gender}`;
            const arduinoData = {
                emocion: emotionTranslations[dominantEmotion] || dominantEmotion,
                edad: Math.round(detection.age),
                genero: detection.gender,
                mano_izquierda: handFingers.left,
                mano_derecha: handFingers.right
            };
            sendToArduino(arduinoData);
        } else {
            emotionResult.textContent = 'No detectado';
            traitsResult.textContent = 'No detectado';
        }
    } catch (error) {
        console.error('Error en detección facial:', error);
        emotionResult.textContent = 'Error';
        traitsResult.textContent = 'Error';
    }
}

// Dibujar puntos faciales
function drawFaceLandmarks(landmarks) {
    const scale = window.canvasScale || { x: 1, y: 1 };

    ctxFace.fillStyle = '#FFFFFF';
    ctxFace.strokeStyle = '#1d428a';
    ctxFace.lineWidth = 1;
    
    landmarks.positions.forEach(point => {
        ctxFace.beginPath();
        ctxFace.arc(point.x * scale.x, point.y * scale.y, 2, 0, Math.PI * 2);
        ctxFace.fill();
    });
    
    const parts = [
        landmarks.getJawOutline(),
        landmarks.getLeftEye(),
        landmarks.getRightEye(),
        landmarks.getLeftEyeBrow(),
        landmarks.getRightEyeBrow(),
        landmarks.getNose(),
        landmarks.getMouth()
    ];
    
    parts.forEach(points => drawLandmarkCurve(points, scale));
}

function drawLandmarkCurve(points, scale) {
    if (points.length < 2) return;
    
    ctxFace.beginPath();
    ctxFace.moveTo(points[0].x * scale.x, points[0].y * scale.y);
    for (let i = 1; i < points.length; i++) {
        ctxFace.lineTo(points[i].x * scale.x, points[i].y * scale.y);
    }
    ctxFace.stroke();
}

// Procesamiento de manos
function processHands(results) {
    if (!detectionActive) return;
    
    ctxHands.clearRect(0, 0, canvasHands.width, canvasHands.height);

    // Reiniciamos los contadores
    handFingers.left = 0;
    handFingers.right = 0;
    
    if (results.multiHandLandmarks?.length > 0) {
        const fingersCounts = [];
        
        results.multiHandLandmarks.forEach((landmarks, i) => {
            drawHandLandmarks(landmarks);
            
            let handedness = results.multiHandedness[i]?.label || 'Unknown';
            let displayHandType = handedness === 'Right' ? 'Izquierda' : 
                                handedness === 'Left' ? 'Derecha' : 'Desconocida';
            
            const fingersUp = countFingers(landmarks, handedness);
            fingersCounts.push(`${fingersUp} (${displayHandType})`);
            
            // Actualizamos las variables GLOBALES
            if (handedness === 'Left') {
                handFingers.left = fingersUp;
            } else if (handedness === 'Right') {
                handFingers.right = fingersUp;
            }
        });
        
        fingersResult.textContent = fingersCounts.join(' y ');
    } else {
        fingersResult.textContent = '-';
    }
}

// Dibujo de manos
function drawHandLandmarks(landmarks) {
    const HAND_CONNECTIONS = [
        [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], 
        [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], 
        [10, 11], [11, 12], [0, 13], [13, 14], 
        [14, 15], [15, 16], [0, 17], [17, 18], 
        [18, 19], [19, 20], [5, 9], [9, 13], [13, 17]
    ];

    ctxHands.strokeStyle = '#1d428a';
    ctxHands.lineWidth = 3;
    ctxHands.beginPath();

    HAND_CONNECTIONS.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        ctxHands.moveTo(startPoint.x * canvasHands.width, 
                        startPoint.y * canvasHands.height);
        ctxHands.lineTo(endPoint.x * canvasHands.width, 
                       endPoint.y * canvasHands.height);
    });
    ctxHands.stroke();

    ctxHands.fillStyle = '#FFFFFF';
    landmarks.forEach(landmark => {
        ctxHands.beginPath();
        ctxHands.arc(landmark.x * canvasHands.width, 
                     landmark.y * canvasHands.height, 
                     4, 0, Math.PI * 2);
        ctxHands.fill();
    });
}

// Detección de dedos
function countFingers(landmarks, handedness) {
    const fingerTips = [4, 8, 12, 16, 20];
    const fingerJoints = [3, 6, 10, 14, 18];
    let count = 0;
    
    for (let i = 1; i <= 4; i++) {
        const tip = landmarks[fingerTips[i]];
        const joint = landmarks[fingerJoints[i]];
        if (tip.y < joint.y) count++;
    }
    
    const thumbTip = landmarks[4];
    const thumbProximal = landmarks[3];
    const xDistance = Math.abs(thumbTip.x - thumbProximal.x);
    const thumbLength = Math.abs(thumbTip.x - landmarks[2].x);
    const isThumbExtended = xDistance > thumbLength * 0.4;
    
    if (isThumbExtended) {
        if ((handedness === 'Right' && thumbTip.x < thumbProximal.x) ||
            (handedness === 'Left' && thumbTip.x > thumbProximal.x)) {
            count++;
        }
    }
    
    return count;
}


// Manejo de eventos de cierre
window.addEventListener('beforeunload', () => {
    stopDetection();
    stream?.getTracks().forEach(track => track.stop());
    
    // Cerrar conexión serial
    if (writer) {
        writer.releaseLock();
    }
    if (serialPort) {
        serialPort.close();
    }
});

// Manejo de pantalla completa
document.addEventListener('DOMContentLoaded', () => {
    const btnFullscreen = document.getElementById('btn-fullscreen');
    btnFullscreen.addEventListener('click', toggleFullscreen);
});