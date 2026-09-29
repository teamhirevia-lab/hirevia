import {
    FaceLandmarker,
    FilesetResolver,
    PoseLandmarker
} from "@mediapipe/tasks-vision"

const WASM_CDN =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"

const FACE_MODEL =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

const POSE_MODEL =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"

const FRAME_INTERVAL_MS = 80
const YAW_THRESHOLD = 0.45
const PITCH_THRESHOLD = 0.4
const IRIS_CENTER_THRESHOLD = 0.22
const BLINK_THRESHOLD = 0.45

const LEFT_IRIS = 468
const RIGHT_IRIS = 473
const LEFT_EYE_OUTER = 33
const LEFT_EYE_INNER = 133
const RIGHT_EYE_INNER = 362
const RIGHT_EYE_OUTER = 263

/**
 * Privacy-first local CV analyzer.
 * Samples live webcam frames; returns aggregated metrics only (no video upload).
 */
export class VideoAnalyzer {

    constructor() {
        this.faceLandmarker = null
        this.poseLandmarker = null
        this.rafId = null
        this.lastSampleAt = 0
        this.running = false
        this.prevNose = null
        this.blinkOpen = true
        this.startedAt = 0
        this.stats = this.createEmptyStats()
    }

    createEmptyStats() {
        return {
            framesAnalyzed: 0,
            faceVisibleFrames: 0,
            facingCameraFrames: 0,
            eyeContactFrames: 0,
            gazeAwayFrames: 0,
            blinkCount: 0,
            movementSum: 0,
            movementSamples: 0,
            postureStableFrames: 0,
            postureSamples: 0
        }
    }

    async init() {
        if (this.faceLandmarker) return

        try {
            const vision = await FilesetResolver.forVisionTasks(WASM_CDN)

            try {
                this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: FACE_MODEL,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numFaces: 1,
                    outputFaceBlendshapes: true,
                    outputFacialTransformationMatrixes: true
                })
            } catch {
                this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: FACE_MODEL,
                        delegate: "CPU"
                    },
                    runningMode: "VIDEO",
                    numFaces: 1,
                    outputFaceBlendshapes: true,
                    outputFacialTransformationMatrixes: true
                })
            }

            try {
                this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: POSE_MODEL,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numPoses: 1
                })
            } catch {
                try {
                    this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath: POSE_MODEL,
                            delegate: "CPU"
                        },
                        runningMode: "VIDEO",
                        numPoses: 1
                    })
                } catch (poseErr) {
                    console.warn("Pose landmarker unavailable; posture will be unknown.", poseErr)
                    this.poseLandmarker = null
                }
            }
        } catch (err) {
            console.error("Failed to init VideoAnalyzer:", err)
            this.faceLandmarker = null
            this.poseLandmarker = null
            throw err
        }
    }

    getHeadPoseFromMatrix(matrix) {
        if (!matrix || matrix.length < 16) {
            return { yaw: 0, pitch: 0, roll: 0 }
        }

        const r00 = matrix[0]
        const r10 = matrix[1]
        const r20 = matrix[2]
        const r21 = matrix[6]
        const r22 = matrix[10]

        const pitch = Math.atan2(-r21, r22)
        const yaw = Math.atan2(r20, Math.sqrt(r00 * r00 + r10 * r10))
        const roll = Math.atan2(r10, r00)

        return { yaw, pitch, roll }
    }

    getBlendshapeScore(blendshapes, name) {
        const categories = blendshapes?.categories || []
        const match = categories.find((item) => item.categoryName === name)
        return match?.score || 0
    }

    isIrisCentered(landmarks, irisIndex, innerIndex, outerIndex) {
        const iris = landmarks[irisIndex]
        const inner = landmarks[innerIndex]
        const outer = landmarks[outerIndex]
        if (!iris || !inner || !outer) return false

        const eyeWidth = Math.abs(outer.x - inner.x)
        if (eyeWidth < 0.01) return false

        const centerX = (inner.x + outer.x) / 2
        const offset = Math.abs(iris.x - centerX) / eyeWidth
        return offset <= IRIS_CENTER_THRESHOLD
    }

    analyzeFrame(videoEl, timestampMs) {
        if (!this.faceLandmarker || !videoEl || videoEl.readyState < 2) return

        this.stats.framesAnalyzed += 1

        const faceResult = this.faceLandmarker.detectForVideo(videoEl, timestampMs)
        const landmarks = faceResult?.faceLandmarks?.[0]
        const hasFace = Boolean(landmarks)

        if (hasFace) {
            this.stats.faceVisibleFrames += 1

            const matrix = faceResult.facialTransformationMatrixes?.[0]
            const { yaw, pitch } = this.getHeadPoseFromMatrix(matrix?.data)
            const facingCamera = Math.abs(yaw) <= YAW_THRESHOLD && Math.abs(pitch) <= PITCH_THRESHOLD

            if (facingCamera) {
                this.stats.facingCameraFrames += 1
            }

            const hasIris = landmarks.length > RIGHT_IRIS
            const leftCentered = hasIris
                ? this.isIrisCentered(landmarks, LEFT_IRIS, LEFT_EYE_INNER, LEFT_EYE_OUTER)
                : facingCamera
            const rightCentered = hasIris
                ? this.isIrisCentered(landmarks, RIGHT_IRIS, RIGHT_EYE_INNER, RIGHT_EYE_OUTER)
                : facingCamera

            const lookingAtCamera = facingCamera && leftCentered && rightCentered
            if (lookingAtCamera) {
                this.stats.eyeContactFrames += 1
            } else {
                this.stats.gazeAwayFrames += 1
            }

            const blendshapes = faceResult.faceBlendshapes?.[0]
            if (blendshapes) {
                const blinkLeft = this.getBlendshapeScore(blendshapes, "eyeBlinkLeft")
                const blinkRight = this.getBlendshapeScore(blendshapes, "eyeBlinkRight")
                const blinking = (blinkLeft + blinkRight) / 2 >= BLINK_THRESHOLD

                if (blinking && this.blinkOpen) {
                    this.stats.blinkCount += 1
                    this.blinkOpen = false
                } else if (!blinking) {
                    this.blinkOpen = true
                }
            }

            const nose = landmarks[1]
            if (this.prevNose && nose) {
                const dx = nose.x - this.prevNose.x
                const dy = nose.y - this.prevNose.y
                const distance = Math.sqrt(dx * dx + dy * dy)
                this.stats.movementSum += distance
                this.stats.movementSamples += 1
            }
            this.prevNose = nose ? { x: nose.x, y: nose.y } : this.prevNose
        }

        if (this.poseLandmarker) {
            const poseResult = this.poseLandmarker.detectForVideo(videoEl, timestampMs)
            const poseLandmarks = poseResult?.landmarks?.[0]

            if (poseLandmarks && poseLandmarks.length > 12) {
                this.stats.postureSamples += 1

                const leftShoulder = poseLandmarks[11]
                const rightShoulder = poseLandmarks[12]
                const nose = poseLandmarks[0]

                if (leftShoulder && rightShoulder && nose) {
                    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2
                    const shoulderDiff = Math.abs(leftShoulder.y - rightShoulder.y)
                    const headAboveShoulders = nose.y < shoulderMidY

                    if (headAboveShoulders && shoulderDiff < 0.08) {
                        this.stats.postureStableFrames += 1
                    }
                }
            }
        }
    }

    start(videoEl) {
        if (this.running) return

        this.stats = this.createEmptyStats()
        this.prevNose = null
        this.blinkOpen = true
        this.running = true
        this.lastSampleAt = 0
        this.startedAt = performance.now()

        const loop = (now) => {
            if (!this.running) return

            if (now - this.lastSampleAt >= FRAME_INTERVAL_MS) {
                this.lastSampleAt = now
                try {
                    this.analyzeFrame(videoEl, now)
                } catch (err) {
                    console.warn("Frame analysis error:", err)
                }
            }

            this.rafId = requestAnimationFrame(loop)
        }

        this.rafId = requestAnimationFrame(loop)
    }

    stop() {
        this.running = false

        if (this.rafId) {
            cancelAnimationFrame(this.rafId)
            this.rafId = null
        }

        return this.getMetrics()
    }

    getMetrics() {
        const {
            framesAnalyzed,
            faceVisibleFrames,
            facingCameraFrames,
            eyeContactFrames,
            gazeAwayFrames,
            blinkCount,
            movementSum,
            movementSamples,
            postureStableFrames,
            postureSamples
        } = this.stats

        if (framesAnalyzed === 0) {
            return null
        }

        const faceVisibility = faceVisibleFrames / framesAnalyzed
        const cameraEngagement = facingCameraFrames / framesAnalyzed
        const eyeContact = eyeContactFrames / framesAnalyzed
        const gazeAwayRate = faceVisibleFrames > 0
            ? gazeAwayFrames / faceVisibleFrames
            : 0

        const elapsedMinutes = Math.max((performance.now() - this.startedAt) / 60000, 1 / 60)
        const blinkRate = Number((blinkCount / elapsedMinutes).toFixed(1))

        const avgMovement = movementSamples > 0
            ? movementSum / movementSamples
            : 0

        let headMovement = "low"
        if (avgMovement > 0.035) headMovement = "high"
        else if (avgMovement > 0.015) headMovement = "moderate"

        let posture = "unknown"
        if (postureSamples > 0) {
            const stableRatio = postureStableFrames / postureSamples
            posture = stableRatio >= 0.6 ? "stable" : "unstable"
        }

        const excessiveMovement = Math.min(1, avgMovement / 0.05)

        return {
            cameraEngagement: Number(cameraEngagement.toFixed(2)),
            faceVisibility: Number(faceVisibility.toFixed(2)),
            eyeContact: Number(eyeContact.toFixed(2)),
            gazeAwayRate: Number(gazeAwayRate.toFixed(2)),
            blinkRate,
            headMovement,
            posture,
            excessiveMovement: Number(excessiveMovement.toFixed(2)),
            framesAnalyzed
        }
    }

    destroy() {
        this.stop()
        this.faceLandmarker?.close?.()
        this.poseLandmarker?.close?.()
        this.faceLandmarker = null
        this.poseLandmarker = null
    }
}

let prefetchPromise = null

export function prefetchVideoModels() {
    if (prefetchPromise) return prefetchPromise
    prefetchPromise = (async () => {
        const analyzer = new VideoAnalyzer()
        await analyzer.init()
        analyzer.destroy()
    })().catch(() => {
        prefetchPromise = null
    })
    return prefetchPromise
}
