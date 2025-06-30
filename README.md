# Detector de Emociones y Gestos

Aplicación web que detecta emociones faciales, edad, género y cuenta dedos levantados en tiempo real usando IA.

## Características
- Detección de emociones (7 categorías)
- Estimación de edad y género
- Conteo de dedos levantados
- Soporte para múltiples manos
- Interfaz en español
- Responsive design

## Requisitos
- Navegador moderno (Chrome, Firefox, Edge)
- Cámara web
- Conexión a internet (para cargar scripts)

## Instalación
1. Clonar repositorio:
```bash
git clone https://github.com/tu-usuario/detector-emociones.git
cd detector-emociones
```

2. Instalar modelos de IA:
- Crear carpeta `models` en la raíz del proyecto
- Descargar modelos de [face-api.js](https://github.com/justadudewhohacks/face-api.js-models) y colocar en la carpeta `models`

3. Ejecutar servidor web:
```bash
# Python
python3 -m http.server

# Node.js (si tienes http-server instalado)
http-server
```

4. Abrir en navegador: `http://localhost:8000`

## Uso
1. Hacer clic en "Activar Cámara"
2. Permitir acceso a la cámara cuando el navegador lo solicite
3. Hacer clic en "Iniciar Detección"
4. Los resultados se mostrarán en tiempo real

## Estructura de archivos
```
├── index.html
├── app.js
├── styles.css
├── models/       # Modelos de IA
│   ├── tiny_face_detector_model-weights_manifest.json
│   ├── face_expression_model-weights_manifest.json
│   └── age_gender_model-weights_manifest.json
└── README.md
```

## Solución de problemas
**Cámara negra:**
- Verificar permisos de cámara
- Asegurar que el navegador tenga acceso al dispositivo
- Probar en modo incógnito

**Modelos no cargan:**
- Verificar que los archivos estén en `/models`
- Asegurar que los nombres de archivo coincidan
- Revisar la consola del navegador para errores 404

**Detección imprecisa:**
- Mejorar iluminación del rostro
- Acercarse a la cámara
- Reducir movimiento excesivo