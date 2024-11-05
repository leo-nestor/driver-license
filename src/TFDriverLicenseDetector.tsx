import { useEffect, useRef, useState } from 'react';

const PREDICTION_DELAY = 200;
const CONFIDENCE_THRESHOLD = 0.95;  // Minimum confidence threshold
const VIDEO_HEIGHT_PERCENTAGE = 0.80;

type Prediction = {
    confidence: number,
    left: number,
    top: number,
    width: number,
    height: number,
    isInside: boolean,
    isValidSize: boolean,
}


function ObjectDetection() {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const boundingRef = useRef<HTMLDivElement>(null);
    const boxesContainerRef = useRef(null);
    const workerRef = useRef<Worker | null>(null);
    const [worker, setWorker] = useState<Worker>();
    const [prediction, setPrediction] = useState<Prediction>({
        confidence: 0,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        isInside: false,
        isValidSize: false,
        // message: '',
        // totalTime: 0,
    });



    useEffect(() => {
        const loadModel = async () => {
            const newWorker = new Worker(new URL(`./loadTFLite.js`, import.meta.url));
            workerRef.current = newWorker;
            newWorker.postMessage({ type: "LOAD_MODEL" });
            newWorker.onmessage = (event) => {
                const { type } = event.data;
                if (type === 'MODEL_LOADED') {
                    setWorker(worker);
                    startCamera();
                } else if (type === 'PREDICTION') {
                    processDetections(event.data.values)
                } else if (type === 'PREDICTION_FAILED') {

                }

            };
        };

        loadModel();

        return () => {
            worker?.terminate();
            workerRef.current?.terminate();
            if (videoRef.current && videoRef.current.srcObject instanceof MediaStream) {
                // eslint-disable-next-line react-hooks/exhaustive-deps
                const stream = videoRef.current.srcObject;
                stream.getTracks().forEach(track => track.stop());
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        requestAnimationFrame(sendFrameToWorker);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workerRef])

    const startCamera = async () => {
        try {
            const videoDevices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 640 },
                    deviceId: videoDevices.find(d => d.label.toLowerCase().includes('back'))?.deviceId || videoDevices[0]?.deviceId
                }
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;

                videoRef.current.onloadedmetadata = () => {
                    // @ts-expect-error error
                    videoRef.current.play();
                };
            }
        } catch (error) {
            console.error("Error accessing webcam:", error);
        }
    };

    const sendFrameToWorker = () => {
        if (!videoRef.current || !canvasRef.current || !workerRef) return;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });

        if (ctx && videoRef.current && canvas && boundingRef.current) {
            const videoWidth = videoRef.current.clientWidth;
            const videoHeight = videoRef.current.clientHeight;

            // Set canvas dimensions to match the video
            canvas.width = videoWidth;
            canvas.height = videoHeight;

            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            if (workerRef) {
                workerRef.current?.postMessage({
                    type: 'DETECT',
                    imageData,
                    videoWidth,
                    videoHeight,
                    boxWidth: boundingRef.current.clientWidth + 6,
                    boxHeight: boundingRef.current.clientHeight + 6
                });
            }
        }

        setTimeout(() => requestAnimationFrame(sendFrameToWorker), PREDICTION_DELAY);

    };

    const processDetections = (values: Prediction) => {
        // TODO: remove this if after development
        if (boxesContainerRef.current) {
            //@ts-expect-error error
            boxesContainerRef.current.innerHTML = "";
        }

        if (values) {
            setPrediction(values);
            // TODO: remove this if after development
            if (boxesContainerRef.current && values.confidence > CONFIDENCE_THRESHOLD) {
                const boxContainer = drawBoundingBoxes(values.left, values.top, values.width, values.height, 'document', values.confidence, 'red');
                //@ts-expect-error error
                boxesContainerRef.current.appendChild(boxContainer);
            }

        }
    };

    //@ts-expect-error error
    // todo: this function can be removed / commented after development
    const drawBoundingBoxes = (left, top, width, height, className, score, color) => {
        const container = document.createElement("div");
        container.classList.add("box-container");

        const box = document.createElement("div");
        box.classList.add("box");
        box.style.borderColor = color;
        box.style.borderWidth = "4px";
        container.appendChild(box);

        const label = document.createElement("div");
        label.classList.add("label");
        label.style.backgroundColor = color;
        label.textContent = `${className} (${score.toFixed(2)})`;
        container.appendChild(label);

        if (videoRef.current) {
            const vidRect = videoRef.current.getBoundingClientRect();
            const offsetX = vidRect.left;
            const offsetY = vidRect.top;

            container.style.left = `${left + offsetX - 1}px`;
            container.style.top = `${top + offsetY}px`;
            box.style.width = `${width + 1}px`;
            box.style.height = `${height + 1}px`;
        }

        return container;
    };

    return (
        <>
            <div style={{ position: 'relative', display: 'inline-block' }}>
                <div style={{ position: 'absolute', color: 'red', fontWeight: 700 }}>
                    {/* TODO: remove this after development */}
                    {`v10 - ${prediction.confidence.toString().slice(0, 9)} isInside: ${prediction.isInside} isValidSize: ${prediction.isValidSize}`}
                </div>
                <video ref={videoRef} className="video" autoPlay playsInline muted style={{ maxWidth: '100%' }}></video>
                <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                <div ref={boundingRef} style={{
                    position: 'absolute', top: '50%', left: '50%', width: '65%', opacity: 1, height: `${VIDEO_HEIGHT_PERCENTAGE * 100}%`, transform: 'translate(-50%, -50%)', border: '3px dashed', borderColor: prediction.isInside && prediction.isValidSize ? 'green' : 'gray',
                    backgroundColor: 'rgba(128, 128, 128, 0.1)',
                    boxShadow: '0px 0px 20px 5px rgba(0, 0, 0, 0.3)',
                    zIndex: 1,
                }} />
                {/* TODO: remove this after development */}
                <div className="boxes-container" ref={boxesContainerRef}></div>
            </div>
        </>
    );
}

export default ObjectDetection;
