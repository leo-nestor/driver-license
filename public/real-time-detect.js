
const MODEL_PATH = '/models/mobilenet-tflite/detect.tflite';
const CONFIDENCE_THRESHOLD = 0.999990;  // Minimum confidence threshold
const MODEL_SIZE = 320;

let video_devices;

let objectDetector;


// Access the webcam and start object detection.
async function startCamera() {

    const videoElement = document.querySelector('.video');

    try {
        video_devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');

        const stream = await navigator.mediaDevices.getUserMedia({ video: {
            deviceId: video_devices.find(d => d.label.toLowerCase().includes('back'))?.deviceId || video_devices[0]?.deviceId

        } });
        videoElement.srcObject = stream;
        videoElement.play();
        detect(videoElement);
    } catch (error) {
        console.error("Error accessing webcam:", error);
    }
}

async function preprocessFrame(video) {
    return tf.tidy(() => {
        const inputTensor = tf.image.resizeBilinear(tf.browser.fromPixels(video), [320, 320]); // Resize to 320x320
        const normalizedTensor = inputTensor
            .asType('float32') // Ensure the data type is float32
            .div(127.5) // Normalize to range [-1, 1]
            .sub(1)
            .expandDims(0); // Add batch dimension

        console.log('Input tensor shape after preprocessing:', normalizedTensor.shape);
        return normalizedTensor;
    });
}


async function detect(videoElement) {
    if (!objectDetector) {
        objectDetector = await tflite.loadTFLiteModel(MODEL_PATH);
    }
    const inputTensor = await preprocessFrame(videoElement); // Ensure videoElement is passed correctly
    const boxesContainer = document.querySelector(".boxes-container");
    boxesContainer.innerHTML = "";

    let predictions;
    try {
        const inputName = 'serving_default_input:0'; // This is the expected input name
        predictions = await objectDetector.predict({ [inputName]: inputTensor });
    } catch (error) {
        console.error('Error during model prediction:', error);
        return;
    }

    const boxes = predictions['StatefulPartitionedCall:3']?.dataSync() || [];
    const scores = predictions['StatefulPartitionedCall:1']?.dataSync() || [];

    console.log(scores, boxes)
    
    if (!predictions) {
        console.error('Predictions are undefined');
        return;
    }

    
    // Proceed with drawing boxes if predictions are valid
    if (boxes && scores) {
        // I'm only insterested in the first detection
        const frameWidth = videoElement.videoWidth; // Use video variable for width
        const frameHeight = videoElement.videoHeight; // Use video variable for height
        const score = scores[0];
        const ymin = boxes[0] * frameHeight;
        const xmin = boxes[1] * frameWidth;
        const ymax = boxes[2] * frameHeight;
        const xmax = boxes[3] * frameWidth;

        const title = document.querySelector(".m-title");
        const container = document.createElement("div");
    container.textContent = "v10 - " + score.toString().slice(0,9);
    title.replaceChildren(container)
         // Check all detections
            if (score > CONFIDENCE_THRESHOLD) { // Set a confidence threshold
                const boxContainer = drawBoundingBoxes(
                    xmin,
                    ymin,
                    xmax - xmin,
                    ymax - ymin,
                    'document',
                    score,
                    'red'
                );
                boxesContainer.appendChild(boxContainer);
            }
        
    } else {
        console.error('Boxes, classes, or scores are undefined');
    }

    requestAnimationFrame(() => detect(videoElement)); // Call detect recursively with videoElement
}


// Draw bounding boxes for top 'N' detections.
function drawBoundingBoxes(left, top, width, height, className, score, color) {
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

    const inputVideoElement = document.getElementById("input-video");
    const vidRect = inputVideoElement.getBoundingClientRect();
    const offsetX = vidRect.left;
    const offsetY = vidRect.top;

    container.style.left = `${left + offsetX - 1}px`;
    container.style.top = `${top + offsetY}px`;
    box.style.width = `${width + 1}px`;
    box.style.height = `${height + 1}px`;

    return container;
}

startCamera();
