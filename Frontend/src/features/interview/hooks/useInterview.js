import { getAllInterviewReports, generateInterviewReport, getInterviewReportById, generateResumePdf, deleteInterviewReportById } from "../services/interview.api"
import { useContext, useEffect } from "react"
import { InterviewContext } from "../interview.context"
import { useParams } from "react-router"
import { idOf } from "../../../shared/id"


export const useInterview = () => {

    const context = useContext(InterviewContext)
    const { interviewId } = useParams()

    if (!context) {
        throw new Error("useInterview must be used within an InterviewProvider")
    }

    const {
        reportsLoading,
        setReportsLoading,
        reportLoading,
        setReportLoading,
        generating,
        setGenerating,
        report,
        setReport,
        reports,
        setReports,
    } = context

    const generateReport = async ({
        jobDescription,
        selfDescription,
        resumeFile,
        company,
        jobProfile,
        yearsOfExperience,
        interviewWindow,
    }) => {
        setGenerating(true)
        try {
            const response = await generateInterviewReport({
                jobDescription,
                selfDescription,
                resumeFile,
                company,
                jobProfile,
                yearsOfExperience,
                interviewWindow,
            })
            setReport(response.interviewReport)
            return response.interviewReport
        } finally {
            setGenerating(false)
        }
    }

    const getReportById = async (interviewId) => {
        setReportLoading(true)
        let response = null
        try {
            response = await getInterviewReportById(interviewId)
            setReport(response.interviewReport)
        } catch (error) {
            console.error("Request failed", error?.response?.status || "")
        } finally {
            setReportLoading(false)
        }
        return response?.interviewReport || null
    }

    const deleteReportById = async (interviewId) => {
        try {
            await deleteInterviewReportById(interviewId)
            setReports((prevReports) =>
                prevReports.filter(
                    (report) =>
                        idOf(report) !== interviewId
                )
            )
        }
        catch (error) {
            console.error("Request failed", error?.response?.status || "")
        }
    }

    const getReports = async () => {
        setReportsLoading(true)
        let response = null
        try {
            response = await getAllInterviewReports()
            setReports(response.interviewReports)
        } catch (error) {
            console.error("Request failed", error?.response?.status || "")
        } finally {
            setReportsLoading(false)
        }

        return response?.interviewReports || []
    }

    const getResumePdf = async (interviewReportId, template = "classic") => {
        const response = await generateResumePdf({ interviewReportId, template })
        const url = window.URL.createObjectURL(new Blob([response], { type: "application/pdf" }))
        const link = document.createElement("a")
        link.href = url
        link.setAttribute("download", `resume_${template}_${interviewReportId}.pdf`)
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
    }

    // const generateMockReport = async ({answers}) => {

    //     setLoading(true)
    
    //     let response = null
    //     try{
    //         response = await generateInterviewReport
    //     }

    // }

    // Whenever, the interviewId changes, the useEffect is called
    useEffect(() => {
        if (interviewId) {
            getReportById(interviewId)
        } else {
            getReports()
        }
    }, [interviewId])

    return {
        loading: reportsLoading || reportLoading,
        reportsLoading,
        reportLoading,
        generating,
        report,
        reports,
        generateReport,
        getReportById,
        getReports,
        getResumePdf,
        deleteReportById,
    }

}