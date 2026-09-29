import { useContext, useEffect } from "react"
import { getAllMockInterviewReports, getMockInterview, deleteMockInterview, startMockInterview, generateMockInterviewReport, updateMockInterview, submitMockAnswer } from "../services/mockinterview.api"
import { idOf } from "../../../shared/id"
import { InterviewContext } from "../interview.context"
import { useParams } from "react-router"

export const useMockInterview = () => {

    const context = useContext(InterviewContext)
    const { interviewId, mockId } = useParams()

    if (!context) {
        throw new Error("useMockInterview must be used within an InterviewProvider")
    }

    const {
        mockLoading,
        setMockLoading,
        mockStarting,
        setMockStarting,
        mockReport,
        setMockReport,
        mockReports,
        setMockReports,
    } = context

    const startMock = async (interviewId, section) => {
        setMockStarting(true)
        let response = null
        try {
            response = await startMockInterview(interviewId, section)
            setMockReport(response.mockInterviewReport)
        } catch (error) {
            console.error("Request failed", error?.response?.status || "")
            throw error
        } finally {
            setMockStarting(false)
        }
        return response?.mockInterviewReport || null
    }

    const getMockReportById = async (interviewId, mockId) => {
        setMockLoading(true)
        let response = null
        try {
            response = await getMockInterview(interviewId, mockId)
            setMockReport(response.mockInterview)
        } catch (error) {
            console.error("Request failed", error?.response?.status || "")
        } finally {
            setMockLoading(false)
        }
        return response?.mockInterview
    }

    const getAllMockReports = async (interviewId) => {
        setMockLoading(true)
        let response = null
        try {
            response = await getAllMockInterviewReports(interviewId)
            setMockReports(response.mockInterviews)
        } catch (error) {
            console.error("Request failed", error?.response?.status || "")
        } finally {
            setMockLoading(false)
        }
        return response?.mockInterviews
    }

    const deleteMockReport = async (interviewId, mockId) => {
        try {
            await deleteMockInterview(interviewId, mockId)
            setMockReports((prev) => prev.filter((report) => idOf(report) !== mockId))
        } catch (error) {
            console.error("Request failed", error?.response?.status || "")
        }
    }

    const completeMockInterview = async ({ answers }) => {
        setMockLoading(true)
        let response = null
        try {
            response = await generateMockInterviewReport({ interviewId, mockId, answers })
            setMockReport(response.mockInterviewReport)
        } catch (error) {
            console.error("Request failed", error?.response?.status || "")
        } finally {
            setMockLoading(false)
        }
        return response?.mockInterviewReport || null
    }

    const updatingMockInterview = async ({ completedSections, answers, currentQuestionIndex, currentSection }) => {
        let response = null
        try {
            response = await updateMockInterview({
                completedSections,
                answers,
                currentQuestionIndex,
                currentSection,
                interviewId,
                mockId,
            })
            setMockReport(response.mockInterviewReport)
        } catch (error) {
            console.error("Request failed", error?.response?.status || "")
        }
        return response?.mockInterviewReport || null
    }

    const submitAnswer = async (payload) => {
        const response = await submitMockAnswer({
            interviewId,
            mockId,
            ...payload,
        })

        if (response?.mockInterviewReport) {
            setMockReport(response.mockInterviewReport)
        }

        return response
    }

    useEffect(() => {
        if (interviewId && mockId) {
            getMockReportById(interviewId, mockId)
        }
    }, [interviewId, mockId])

    return {
        loading: mockLoading || mockStarting,
        mockStarting,
        mockReport,
        mockReports,
        startMock,
        completeMockInterview,
        getMockReportById,
        getAllMockReports,
        deleteMockReport,
        updatingMockInterview,
        submitAnswer,
    }
}
