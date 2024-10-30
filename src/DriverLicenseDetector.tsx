import { useEffect, useRef, useState } from 'react';

const CONFIDENCE_THRESHOLD = 0.72;
const PREDICTION_DELAY = 300;
const VIDEO_HEIGHT_PERCENTAGE = 0.85;

const documentWorker = new Worker('/documentDetect.js');
documentWorker.postMessage({
    type: 'load_model',
});


const DriverLicenseDetector = () => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const boundingRef = useRef<HTMLDivElement>(null);

    const [loading, setLoading] = useState(true);
    const [prediction, setPrediction] = useState({
        currentScore: 0,
        y_min: 0,
        x_min: 0,
        y_max: 0,
        x_max: 0,
        isInside: false,
        isSizeValid: false,
        message: '',
        totalTime: 0,
    });

    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
    const [isInGrayArea, setIsInGrayArea] = useState(false);
    const [userMessage, setUserMessage] = useState('');
    const [error, setError] = useState<string | null>(null);


    // worker events
    const workerEvents = () => {
        documentWorker.onmessage = (event) => {
            const { type, prediction, error } = event.data;
            if (type === 'modelLoaded') {
                requestAnimationFrame(captureFrame)
                setLoading(false);
            } else if (type === 'prediction') {
                setPrediction(prediction);
                setIsInGrayArea(true);
                setUserMessage('');
            } else if (type === 'prediction_failed') {
                setPrediction(prediction);
                setIsInGrayArea(false);
                setUserMessage(prediction.message);
            } else if (type === 'error') setError(error);

        };
    };

    useEffect(() => {
        if (
            typeof window !== 'undefined' &&
            typeof navigator !== 'undefined' &&
            navigator.mediaDevices &&
            // @ts-expect-error error
            navigator.mediaDevices.getUserMedia
        ) {
            // Handle messages from the worker
            workerEvents();
        }
    }, []);

    // To set the back camera as default
    useEffect(() => {
        const getDevices = async () => {
            try {
                const videoDevices = (await navigator.mediaDevices.enumerateDevices())
                    .filter(device => device.kind === 'videoinput');
                setDevices(videoDevices);
                setCurrentDeviceId(videoDevices.find(d => d.label.toLowerCase().includes('back'))?.deviceId || videoDevices[0]?.deviceId);
            } catch {
                setError("Failed to access devices.");
            }
        };
        getDevices();
    }, []);

    useEffect(() => {
        if (currentDeviceId && !loading) {
            navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: currentDeviceId, facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 640 }
                }
            })
                .then(stream => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.play();
                        // Esperar a que los metadatos del video se carguen
                        videoRef.current.addEventListener('loadeddata', () => {
                            // Verificar que videoRef.current no sea null
                            if (videoRef.current && canvasRef.current) {
                                canvasRef.current.width = videoRef.current.videoWidth;  // Ajustar el ancho del canvas
                                canvasRef.current.height = videoRef.current.videoHeight; // Ajustar la altura del canvas
                            }
                        });
                    }
                }).catch(() => setError("Failed to access camera."));
        }
    }, [currentDeviceId, loading]);

    const captureFrame = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });

        if (ctx && videoRef.current && canvas && boundingRef.current) {

            // Ajustar el canvas para reflejar el tamaño real del video en pantalla
            const videoWidth = videoRef.current.clientWidth;
            const videoHeight = videoRef.current.clientHeight;

            canvas.width = videoWidth;
            canvas.height = videoHeight;

            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

            documentWorker.postMessage({
                type: 'predict',
                imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
                videoWidth: canvas.width,  // Dimensiones del video fuente (640x640)
                videoHeight: canvas.height,
                boxWidth: boundingRef.current.clientWidth + 6,  // Ajustado a las dimensiones del box
                boxHeight: boundingRef.current.clientHeight + 6
            });
        }

        setTimeout(() => requestAnimationFrame(captureFrame), PREDICTION_DELAY);
    };

    useEffect(() => {
        if (prediction.currentScore >= CONFIDENCE_THRESHOLD) {
            setIsInGrayArea(prediction.isInside && prediction.isSizeValid);

            // Actualizar el mensaje del usuario basado en la predicción recibida del worker
            setUserMessage(
                !prediction.isSizeValid && prediction.isInside
                    ? "Bring the document closer"
                    : !prediction.isInside && prediction.isSizeValid
                        ? "Place document inside the rectangle"
                        : ''
            );
        } else {
            // Resetear el mensaje y el estado si la predicción no supera el umbral de confianza
            setUserMessage('');
            setIsInGrayArea(false);
        }
    }, [prediction.currentScore, prediction.isInside, prediction.isSizeValid]);


    const switchCamera = () => {
        const nextIndex = (devices.findIndex(d => d.deviceId === currentDeviceId) + 1) % devices.length;
        setCurrentDeviceId(devices[nextIndex]?.deviceId);
    };

    const boxStyles = () => {
        if (!videoRef.current || !canvasRef.current) {
            return {};  // Return an empty object when refs are not ready
        }

        const video = videoRef.current;

        const videoW = video.clientWidth;  // Get the actual width of the video on the screen
        const videoH = video.clientHeight;

        const { y_min, x_min, y_max, x_max } = prediction;

        // Scaling the prediction coordinates to the actual video size
        const scaleX = videoW / video.videoWidth;
        const scaleY = videoH / video.videoHeight;

        const top = y_min * scaleY;
        const left = x_min * scaleX;
        const boxWidth = (x_max - x_min) * scaleX;
        const boxHeight = (y_max - y_min) * scaleY;

        // Ensure valid style values for position, top, left, width, height, etc.
        return {
            position: 'absolute' as const,  // Explicitly cast to expected string values
            top: `${top}px`,
            left: `${left}px`,
            width: `${boxWidth}px`,
            height: `${boxHeight}px`,
            border: '2px solid green',
            zIndex: 2,
        };
    };



    if (loading) return <div>Loading model...</div>;
    if (error) return <div style={{ color: 'red' }}>{error}</div>;

    return (
        <>
            <div style={{ position: 'relative', display: 'inline-block' }}>
                <video ref={videoRef} muted playsInline autoPlay style={{ maxWidth: '100%' }} />
                <div ref={boundingRef} style={{ position: 'absolute', top: '50%', left: '50%', width: '65%', height: `${VIDEO_HEIGHT_PERCENTAGE * 100}%`, transform: 'translate(-50%, -50%)', border: '3px dashed', borderColor: prediction.currentScore >= CONFIDENCE_THRESHOLD && isInGrayArea ? 'green' : 'gray', backgroundColor: 'rgba(128, 128, 128, 0.1)', zIndex: 1 }} />
                {prediction.currentScore >= CONFIDENCE_THRESHOLD && <div style={boxStyles()} />}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <div style={{ position: 'absolute', color: isInGrayArea ? 'green' : 'red' }}>{userMessage}</div>
            </div>
            <br></br>
            <br></br>
            {prediction.currentScore}
            <br></br>
            prediction time: {prediction.totalTime}ms
            <button style={{ backgroundColor: 'red', fontSize: '20px', padding: '10px', width: '100%' }} onClick={switchCamera}>Switch Camera</button>
        </>
    );
};

export default DriverLicenseDetector;
