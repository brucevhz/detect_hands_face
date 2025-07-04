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
}

// Ajustar dimensiones
function handleResize() {
    if (video.videoWidth && video.videoHeight) {
        const { videoWidth, videoHeight } = video;
        
        document.querySelector('.video-container').style.aspectRatio = `${videoWidth}/${videoHeight}`;
        [canvasHands, canvasFace].forEach(canvas => {
            canvas.width = videoWidth;
            canvas.height = videoHeight;
        });
    }
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

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
            const { x, y, width, height } = detection.detection.box;
            ctxFace.strokeStyle = '#f08b36';
            ctxFace.lineWidth = 3;
            ctxFace.strokeRect(x, y, width, height);
            
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
    ctxFace.fillStyle = '#FFFFFF';
    ctxFace.strokeStyle = '#1d428a';
    ctxFace.lineWidth = 1;
    
    landmarks.positions.forEach(point => {
        ctxFace.beginPath();
        ctxFace.arc(point.x, point.y, 2, 0, Math.PI * 2);
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
    
    parts.forEach(points => drawLandmarkCurve(points));
}

function drawLandmarkCurve(points) {
    if (points.length < 2) return;
    
    ctxFace.beginPath();
    ctxFace.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctxFace.lineTo(points[i].x, points[i].y);
    }
    ctxFace.stroke();
}

// Procesamiento de manos
function processHands(results) {
    if (!detectionActive) return;
    
    ctxHands.clearRect(0, 0, canvasHands.width, canvasHands.height);
    
    if (results.multiHandLandmarks?.length > 0) {
        const fingersCounts = [];
        
        results.multiHandLandmarks.forEach((landmarks, i) => {
            drawHandLandmarks(landmarks);
            
            let handedness = results.multiHandedness[i]?.label || 'Unknown';
            let displayHandType = handedness === 'Right' ? 'Izquierda' : 
                                handedness === 'Left' ? 'Derecha' : 'Desconocida';
            
            const fingersUp = countFingers(landmarks, handedness);
            fingersCounts.push(`${fingersUp} (${displayHandType})`);
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
        ctxHands.moveTo(startPoint.x * canvasHands.width, startPoint.y * canvasHands.height);
        ctxHands.lineTo(endPoint.x * canvasHands.width, endPoint.y * canvasHands.height);
    });
    ctxHands.stroke();

    ctxHands.fillStyle = '#FFFFFF';
    landmarks.forEach(landmark => {
        ctxHands.beginPath();
        ctxHands.arc(landmark.x * canvasHands.width, landmark.y * canvasHands.height, 4, 0, Math.PI * 2);
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
});

window.addEventListener('resize', () => {
    if (video.videoWidth) {
        canvasHands.width = video.videoWidth;
        canvasHands.height = video.videoHeight;
    }
});