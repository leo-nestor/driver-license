import { useEffect, useRef, useState } from 'react';
const PREDICTION_DELAY = 200;
// TODO: remove after development
const CONFIDENCE_THRESHOLD = 0.95;  // Minimum confidence threshold
const VIDEO_HEIGHT_PERCENTAGE = 0.80;
const HOLD_STILL_TIME = 3000;
const IMAGE_SIZE = 1600; // e.g., double the display width

type Prediction = {
    confidence: number,
    left: number,
    top: number,
    width: number,
    height: number,
    isInside: boolean,
    isValidSize: boolean,
    totalTime: number;
}


function ObjectDetection() {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const boundingRef = useRef<HTMLDivElement>(null);
    const boxesContainerRef = useRef(null);
    const workerRef = useRef<Worker | null>(null);
    const [worker, setWorker] = useState<Worker>();
    const [imageSpecs, setImageSpecs] = useState({ width: 0, height: 0, sizeKB: 0 });
    const [prediction, setPrediction] = useState<Prediction>({
        confidence: 0,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        isInside: false,
        isValidSize: false,
        // message: '',
        totalTime: HOLD_STILL_TIME,
    });
    const [capturedImage, setCapturedImage] = useState<string | ImageData | null>(
        null,
    );



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
    }, [workerRef]);

    useEffect(() => {
        if (prediction.isValidSize && prediction.isInside && prediction.totalTime <= 0 && !capturedImage) {
            // take the photo
            const videoElement = document.getElementById('myVideo');
            const highResImage = captureHighResImage(videoElement);
            setCapturedImage(highResImage);
        }
    }, [prediction]);

    // getFrameImage
    // @ts-expect-error
    const captureHighResImage = (videoElement) => {
        // Define the desired resolution

        // Create an off-screen canvas for high resolution
        const offScreenCanvas = document.createElement('canvas');
        offScreenCanvas.width = IMAGE_SIZE;
        offScreenCanvas.height = IMAGE_SIZE;
        const ctx = offScreenCanvas.getContext('2d');

        // Draw the video on the larger canvas
        // @ts-expect-error
        ctx.drawImage(videoElement, 0, 0, IMAGE_SIZE, IMAGE_SIZE);

        // Get the high-resolution image as a base64 string
        const highResImage = offScreenCanvas.toDataURL('image/png');

        const img = new Image();
        img.src = highResImage;

        img.onload = () => {
            // Get dimensions
            const width = img.width;
            const height = img.height;

            // Calculate size in KB
            const sizeKB = Math.round((highResImage.length * 3) / 4 / 1024); // Rough estimate for base64 size in KB

            // Set the specs
            setImageSpecs({ width, height, sizeKB });
        }
        return highResImage;
    };


    function getFrameImage(base64 = false) {
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
            if (base64) {
                return canvas.toDataURL('image/jpeg');
            }

            // Extract image data from the canvas
            return ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

    }

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
        console.log(captureHighResImage)
        if (videoRef.current && canvasRef.current && !workerRef && !capturedImage) {

        }
        if (!videoRef.current || !canvasRef.current || !workerRef || capturedImage) return;

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
            setPrediction((prev) => (
                {
                    isInside: values.isInside,
                    isValidSize: values.isValidSize,
                    confidence: values.confidence,
                    top: values.top,
                    width: values.width,
                    height: values.height,
                    left: values.left,
                    totalTime: !values.isInside || !values.isValidSize ? HOLD_STILL_TIME : (prev.totalTime <= PREDICTION_DELAY / 2) ? 0 : prev.totalTime - (PREDICTION_DELAY / 2)
                })
            );
            // TODO: remove this if after development
            if (boxesContainerRef.current && values.confidence >= CONFIDENCE_THRESHOLD) {
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
            {capturedImage && videoRef.current ? (
                <div style={{ height: 1000 }}>
                    <img
                        alt="captured face"
                        // @ts-expect-error error
                        src={capturedImage}
                        width={IMAGE_SIZE / 2}
                        height={IMAGE_SIZE / 2}
                    />
                    <button onClick={() => {
                        setCapturedImage(null);
                        setImageSpecs({ width: 0, height: 0, sizeKB: 0 })
                        startCamera();
                        requestAnimationFrame(sendFrameToWorker);

                    }}>reset</button>
                    {JSON.stringify(imageSpecs)}
                </div>

            ) :
                (<>

                    <div style={{ position: 'relative', display: 'inline-block' }}>
                        <div style={{ position: 'absolute', color: 'red', fontWeight: 700 }}>
                            {/* TODO: remove this after development */}
                            {`v11 - ${prediction.confidence.toString().slice(0, 9)}`}
                        </div>
                        <video ref={videoRef} className="video" id="myVideo" autoPlay playsInline muted style={{ maxWidth: '100%' }}></video>
                        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                        <div ref={boundingRef} style={{
                            position: 'absolute', top: '50%', left: '50%', width: '65%', opacity: 1, height: `${VIDEO_HEIGHT_PERCENTAGE * 100}%`, transform: 'translate(-50%, -50%)', border: '3px dashed', borderColor: prediction.isInside && prediction.isValidSize ? 'green' : 'gray',
                            backgroundColor: 'rgba(128, 128, 128, 0.1)',
                            boxShadow: '0px 0px 20px 5px rgba(0, 0, 0, 0.3)',
                            zIndex: 1,
                        }} >
                            {
                                prediction.isInside && prediction.isValidSize &&
                                <div style={{ position: 'absolute', bottom: -25, fontSize: 20, fontWeight: 700, color: 'white' }}>
                                    Taking the photo, hold still {prediction.totalTime + 1000 > 1000 ? (prediction.totalTime + 1000).toString()[0] : 0}...
                                </div>
                            }
                        </div>
                        {/* TODO: remove this after development */}
                        <div className="boxes-container" ref={boxesContainerRef}></div>
                    </div>
                </>
                )
            }

        </>
    );
}

export default ObjectDetection;
