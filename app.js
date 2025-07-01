// Configuración global
const video = document.getElementById('video');
const btnStart = document.getElementById('btn-start');
const btnDetect = document.getElementById('btn-detect');
const emotionResult = document.getElementById('emotion-result');
const fingersResult = document.getElementById('fingers-result');
const traitsResult = document.getElementById('traits-result');
const canvasHands = document.getElementById('canvas-hands');
const ctxHands = canvasHands.getContext('2d');

// Variables de estado
let handTracker = null;
let detectionActive = false;
let faceDetectionInterval = null;
let handDetectionInterval = null;
let stream = null;

// Traducciones al español
const emotionTranslations = {
    'neutral': 'Neutral',
    'happy': 'Feliz',
    'sad': 'Triste',
    'angry': 'Enojado',
    'fearful': 'Temeroso',
    'disgusted': 'Disgustado',
    'surprised': 'Sorprendido'
};

// 1. Iniciar cámara
btnStart.addEventListener('click', async () => {
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Tu navegador no soporta acceso a la cámara");
        }
        
        btnStart.disabled = true;
        btnStart.textContent = 'Iniciando cámara...';
        
        const constraints = {
            video: {
                facingMode: 'user',
                width: { min: 320, ideal: 640, max: 1280 },
                height: { min: 240, ideal: 480, max: 720 },
                frameRate: { ideal: 30, min: 15 }
            }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        // Esperar a que el video esté listo
        await new Promise((resolve) => {
            const onLoaded = () => {
                canvasHands.width = video.videoWidth;
                canvasHands.height = video.videoHeight;
                resolve();
            };
            
            if (video.readyState >= 4) {
                onLoaded();
            } else {
                video.addEventListener('loadeddata', onLoaded, { once: true });
            }
        });
        
        // Forzar reproducción
        try {
            await video.play();
        } catch (playError) {
            console.warn('Auto-play falló, intentando con muted:', playError);
            video.muted = true;
            await video.play();
        }
        
        btnDetect.disabled = false;
        btnStart.textContent = 'Cámara Activa';
        console.log('Cámara iniciada correctamente');
        
    } catch (error) {
        console.error('Error de cámara:', error);
        btnStart.disabled = false;
        btnStart.textContent = 'Activar Cámara';
        
        let message = 'Error al acceder a la cámara: ';
        switch(error.name) {
            case 'NotAllowedError':
                message += 'Permiso denegado. Por favor permite el acceso a la cámara.';
                break;
            case 'NotFoundError':
                message += 'No se encontró cámara. Conecta una cámara e intenta de nuevo.';
                break;
            case 'OverconstrainedError':
                message += 'Configuración no compatible. Intenta con otro navegador o dispositivo.';
                break;
            case 'NotReadableError':
                message += 'La cámara está siendo usada por otra aplicación.';
                break;
            default:
                message += error.message || error;
        }
        
        alert(message);
    }
});

// 2. Control de detección
btnDetect.addEventListener('click', () => {
    detectionActive ? stopDetection() : startDetection();
    btnDetect.textContent = detectionActive ? 'Detener Detección' : 'Iniciar Detección';
});

async function startDetection() {
    detectionActive = true;
    btnDetect.disabled = true;
    btnDetect.textContent = 'Cargando modelos...';
    
    try {
        // Cargar modelos FaceAPI
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
            faceapi.nets.faceExpressionNet.loadFromUri('./models'),
            faceapi.nets.ageGenderNet.loadFromUri('./models')
        ]);
        
        // Configurar MediaPipe Hands
        handTracker = new window.Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        
        await handTracker.setOptions({
            maxNumHands: 2,
            modelComplexity: 0,
            minDetectionConfidence: 0.6
        });
        
        handTracker.onResults(processHands);
        
        // Iniciar detecciones periódicas
        faceDetectionInterval = setInterval(detectFace, 800);
        handDetectionInterval = setInterval(() => {
            if (video.readyState >= 2) {
                try {
                    handTracker.send({ image: video });
                } catch (sendError) {
                    console.warn('Error enviando a MediaPipe:', sendError);
                }
            }
        }, 300);
        
        btnDetect.disabled = false;
        console.log('Detección iniciada');
        
    } catch (error) {
        console.error('Error inicializando detectores:', error);
        let message = 'Error al iniciar detección: ';
        message += error.message.includes('404') 
            ? 'Modelos no encontrados. Verifica la carpeta "models"' 
            : 'Ver consola para detalles';
        
        alert(message);
        stopDetection();
    }
}

function stopDetection() {
    detectionActive = false;
    
    clearInterval(faceDetectionInterval);
    clearInterval(handDetectionInterval);
    
    ctxHands.clearRect( 0, 0, canvasHands.width, canvasHands.height);
    emotionResult.textContent = '-';
    fingersResult.textContent = '-';
    traitsResult.textContent = '-';
    
    btnDetect.disabled = false;
    console.log('Detección detenida');
}

// 3. Detección facial
async function detectFace() {
    if (!detectionActive || !video.videoWidth) return;
    
    try {
        const detection = await faceapi.detectSingleFace(
            video, 
            new faceapi.TinyFaceDetectorOptions()
        ).withFaceExpressions().withAgeAndGender();
        
        if (detection) {
            const expressions = detection.expressions;
            const dominantEmotion = Object.keys(expressions).reduce(
                (a, b) => expressions[a] > expressions[b] ? a : b
            );
            
            emotionResult.textContent = `${emotionTranslations[dominantEmotion] || dominantEmotion} (${Math.round(expressions[dominantEmotion] * 100)}%)`;
            traitsResult.textContent = `${Math.round(detection.age)} años, ${detection.gender}`;
        }
    } catch (error) {
        console.warn('Error en detección facial:', error);
    }
}

// 4. Procesamiento de manos
function processHands(results) {
    if (!detectionActive) return;
    
    ctxHands.clearRect(0, 0, canvasHands.width, canvasHands.height);
    
    if (results.multiHandLandmarks?.length > 0) {
        const fingersCounts = [];
        
        results.multiHandLandmarks.forEach((landmarks, i) => {
            drawHandLandmarks(landmarks);
            
            const handedness = results.multiHandedness[i]?.label || 'Unknown';
            const handType = handedness === 'Right' ? 'Derecha' : 'Izquierda';
            
            // Pasar la información de lateralidad al contador de dedos
            const fingersUp = countFingers(landmarks, handedness);
            fingersCounts.push(`${fingersUp} (${handType})`);
        });
        
        fingersResult.textContent = fingersCounts.join(' y ');
    } else {
        fingersResult.textContent = '-';
    }
}

// 5. Dibujo optimizado de manos (VERSIÓN CORREGIDA)
function drawHandLandmarks(landmarks) {
    // Conexiones predefinidas entre puntos de la mano
    const HAND_CONNECTIONS = [
        [0, 1], [1, 2], [2, 3], [3, 4],       // Pulgar
        [0, 5], [5, 6], [6, 7], [7, 8],       // Índice
        [0, 9], [9, 10], [10, 11], [11, 12],  // Medio
        [0, 13], [13, 14], [14, 15], [15, 16],// Anular
        [0, 17], [17, 18], [18, 19], [19, 20],// Meñique
        [5, 9], [9, 13], [13, 17]             // Base de los dedos
    ];

    // Dibujar conexiones
    ctxHands.strokeStyle = '#00FF00';
    ctxHands.lineWidth = 2;
    ctxHands.beginPath();

    HAND_CONNECTIONS.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        
        ctxHands.moveTo(
            startPoint.x * canvasHands.width, 
            startPoint.y * canvasHands.height
        );
        ctxHands.lineTo(
            endPoint.x * canvasHands.width, 
            endPoint.y * canvasHands.height
        );
    });
    
    ctxHands.stroke();

    // Dibujar puntos
    ctxHands.fillStyle = '#FF0000';
    landmarks.forEach(landmark => {
        ctxHands.beginPath();
        ctxHands.arc(
            landmark.x * canvasHands.width, 
            landmark.y * canvasHands.height, 
            4, 0, Math.PI * 2
        );
        ctxHands.fill();
    });
}

// 6. ALGORITMO DE DETECCIÓN DE DEDOS MEJORADO (PULGAR SIMPLIFICADO)
function countFingers(landmarks, handedness) {
    // Definición de puntos clave
    const fingerTips = [4, 8, 12, 16, 20];
    const fingerJoints = [3, 6, 10, 14, 18];
    
    let count = 0;
    
    // Detección para dedos largos (índice a meñique) - Mantenemos esta parte
    for (let i = 1; i <= 4; i++) {
        const tip = landmarks[fingerTips[i]];
        const joint = landmarks[fingerJoints[i]];
        
        if (tip.y < joint.y) {
            count++;
        }
    }
    
    // DETECCIÓN DE PULGAR SIMPLIFICADA (SOLO EJE X)
    const thumbTip = landmarks[4];     // Falange distal (punta)
    const thumbProximal = landmarks[3];// Falange proximal
    
    // Calcular distancia horizontal relativa
    const xDistance = Math.abs(thumbTip.x - thumbProximal.x);
    const thumbLength = Math.abs(thumbTip.x - landmarks[2].x); // Longitud aproximada del pulgar
    
    // Umbral para considerar dedo extendido (40% de la longitud del pulgar)
    const extensionThreshold = thumbLength * 0.4;
    
    // Determinar si está extendido basado en distancia horizontal
    const isThumbExtended = xDistance > extensionThreshold;
    
    // Considerar dirección basada en lateralidad
    if (isThumbExtended) {
        if ((handedness === 'Right' && thumbTip.x < thumbProximal.x) ||
            (handedness === 'Left' && thumbTip.x > thumbProximal.x)) {
            count++;
        }
    }
    
    return count;
}

// Manejo de eventos
window.addEventListener('beforeunload', () => {
    stopDetection();
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
});

window.addEventListener('resize', () => {
    if (video.videoWidth) {
        canvasHands.width = video.videoWidth;
        canvasHands.height = video.videoHeight;
    }
});
