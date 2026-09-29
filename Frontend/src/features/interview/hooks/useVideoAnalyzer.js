import { useEffect, useRef, useState } from "react"
import { VideoAnalyzer } from "../services/videoAnalyzer"

/**
 * @description Runs local MediaPipe analysis only while the candidate is answering.
 */
export const useVideoAnalyzer = () => {

    const analyzerRef = useRef(null)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [analyzerReady, setAnalyzerReady] = useState(false)
    const [analyzerError, setAnalyzerError] = useState(null)
    const [liveMetrics, setLiveMetrics] = useState(null)

    useEffect(() => {
        const analyzer = new VideoAnalyzer()
        analyzerRef.current = analyzer

        analyzer.init()
            .then(() => {
                setAnalyzerReady(true)
                setAnalyzerError(null)
            })
            .catch((err) => {
                setAnalyzerReady(false)
                setAnalyzerError(err?.message || "Video analyzer failed to load")
            })

        return () => {
            analyzer.destroy()
            analyzerRef.current = null
        }
    }, [])

    useEffect(() => {
        if (!isAnalyzing) return undefined

        const intervalId = window.setInterval(() => {
            const snapshot = analyzerRef.current?.getMetrics?.()
            if (snapshot) setLiveMetrics(snapshot)
        }, 700)

        return () => window.clearInterval(intervalId)
    }, [isAnalyzing])

    const startAnalysis = async (videoEl) => {
        if (!videoEl) return

        try {
            if (!analyzerRef.current) {
                analyzerRef.current = new VideoAnalyzer()
            }

            if (!analyzerReady) {
                await analyzerRef.current.init()
                setAnalyzerReady(true)
            }

            analyzerRef.current.start(videoEl)
            setLiveMetrics(null)
            setIsAnalyzing(true)
        } catch (err) {
            console.error("Could not start video analysis:", err)
            setAnalyzerError(err?.message || "Could not start video analysis")
            setIsAnalyzing(false)
        }
    }

    const stopAnalysis = () => {
        const metrics = analyzerRef.current?.stop?.() ?? null
        setIsAnalyzing(false)
        setLiveMetrics(metrics)
        return metrics
    }

    return {
        isAnalyzing,
        analyzerReady,
        analyzerError,
        liveMetrics,
        startAnalysis,
        stopAnalysis
    }
}
