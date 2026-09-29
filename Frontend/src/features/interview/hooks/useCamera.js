import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Webcam preview — attaches the stream when the video element mounts,
 * even if getUserMedia resolved earlier during a loading screen.
 */
export const useCamera = ({ enabled = true } = {}) => {
    const videoNodeRef = useRef(null)
    const streamRef = useRef(null)

    const [isCameraReady, setIsCameraReady] = useState(false)
    const [cameraError, setCameraError] = useState(null)

    const attachStream = useCallback((videoEl, stream) => {
        if (!videoEl || !stream) return

        if (videoEl.srcObject !== stream) {
            videoEl.srcObject = stream
        }

        const play = () => {
            videoEl.play().catch(() => {})
        }

        if (videoEl.readyState >= HTMLMediaElement.HAVE_METADATA) {
            play()
        } else {
            videoEl.onloadedmetadata = play
        }
    }, [])

    const videoRef = useCallback((node) => {
        videoNodeRef.current = node
        if (node && streamRef.current) {
            attachStream(node, streamRef.current)
            setIsCameraReady(true)
        }
    }, [attachStream])

    useEffect(() => {
        if (!enabled) {
            setIsCameraReady(false)
            return undefined
        }

        let cancelled = false

        async function startCamera() {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: "user",
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    audio: false,
                })

                if (cancelled) {
                    mediaStream.getTracks().forEach((track) => track.stop())
                    return
                }

                streamRef.current = mediaStream
                attachStream(videoNodeRef.current, mediaStream)
                setIsCameraReady(Boolean(videoNodeRef.current))
                setCameraError(null)
            } catch (err) {
                console.error("Error accessing camera:", err)
                setCameraError(err.message || "Camera access failed")
                setIsCameraReady(false)
            }
        }

        startCamera()

        return () => {
            cancelled = true

            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop())
                streamRef.current = null
            }

            if (videoNodeRef.current) {
                videoNodeRef.current.srcObject = null
            }

            setIsCameraReady(false)
        }
    }, [enabled, attachStream])

    return {
        videoRef,
        stream: streamRef.current,
        isCameraReady,
        cameraError,
    }
}
