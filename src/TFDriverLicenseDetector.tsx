import React, { useEffect, useRef, useState } from 'react';

const MODEL_PATH = '/models/mobilenet-tflite/detect.tflite';
const CONFIDENCE_THRESHOLD = 0.999990;  // Minimum confidence threshold

function ObjectDetection() {
    const videoRef = useRef(null);
    const boxesContainerRef = useRef(null);
    const titleRef = useRef(null);
    const [objectDetector, setObjectDetector] = useState(null);

    useEffect(() => {
        const loadModel = async () => {
            // @ts-expect-error error

            const model = await tflite.loadTFLiteModel(MODEL_PATH);
            setObjectDetector(model);
        };

        loadModel();
        startCamera();

        return () => {
            // @ts-expect-error error
            if (videoRef.current && videoRef.current.srcObject) {
                // @ts-expect-error error
                const stream = videoRef.current.srcObject;
                // @ts-expect-error error
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const startCamera = async () => {
        try {
            const videoDevices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: videoDevices.find(d => d.label.toLowerCase().includes('back'))?.deviceId || videoDevices[0]?.deviceId
                }
            });

            if (videoRef.current) {
                // @ts-expect-error error

                videoRef.current.srcObject = stream;

                // Wait for metadata to load before playing the video
                // @ts-expect-error error

                videoRef.current.onloadedmetadata = () => {
                    // @ts-expect-error error

                    videoRef.current.play();
                    detect(videoRef.current);
                };
            }
        } catch (error) {
            console.error("Error accessing webcam:", error);
        }
    };

    // @ts-expect-error error
    const preprocessFrame = async (video) => {
        // @ts-expect-error error

        return tf.tidy(() => {
            // @ts-expect-error error

            const inputTensor = tf.image.resizeBilinear(tf.browser.fromPixels(video), [320, 320]);
            const normalizedTensor = inputTensor
                .asType('float32')
                .div(127.5)
                .sub(1)
                .expandDims(0);
            return normalizedTensor;
        });
    };
    // @ts-expect-error error
    const detect = async (videoElement) => {
        console.log("detecting")
        if (!objectDetector) return;

        const inputTensor = await preprocessFrame(videoElement);
        if (boxesContainerRef.current) {
            // @ts-expect-error error
            boxesContainerRef.current.innerHTML = "";
        }

        let predictions;
        try {
            const inputName = 'serving_default_input:0';
            // @ts-expect-error error
            predictions = await objectDetector.predict({ [inputName]: inputTensor });
        } catch (error) {
            console.error('Error during model prediction:', error);
            return;
        }

        const boxes = predictions['StatefulPartitionedCall:3']?.dataSync() || [];
        const scores = predictions['StatefulPartitionedCall:1']?.dataSync() || [];

        if (boxes && scores && boxes.length > 0) {
            const frameWidth = videoElement.videoWidth;
            const frameHeight = videoElement.videoHeight;
            const score = scores[0];
            const ymin = boxes[0] * frameHeight;
            const xmin = boxes[1] * frameWidth;
            const ymax = boxes[2] * frameHeight;
            const xmax = boxes[3] * frameWidth;

            if (titleRef.current) {
                // @ts-expect-error error

                titleRef.current.textContent = `v10 - ${score.toString().slice(0, 9)}`;
            }

            if (score > CONFIDENCE_THRESHOLD) {
                const boxContainer = drawBoundingBoxes(xmin, ymin, xmax - xmin, ymax - ymin, 'document', score, 'red');
                if (boxesContainerRef.current) {
                    // @ts-expect-error error

                    boxesContainerRef.current.appendChild(boxContainer);
                }
            }
        } else {
            console.error('Boxes or scores are undefined');
        }

        requestAnimationFrame(() => detect(videoElement));
    };

    // @ts-expect-error error
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
            // @ts-expect-error error
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
        <div className="object-detection">
            <div className="m-title" ref={titleRef}></div>
            <video ref={videoRef} className="video" autoPlay playsInline muted></video>
            <div className="boxes-container" ref={boxesContainerRef}></div>
        </div>
    );
}

export default ObjectDetection;
