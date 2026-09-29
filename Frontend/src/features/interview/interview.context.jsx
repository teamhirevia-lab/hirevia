import { createContext,useState } from "react";


export const InterviewContext = createContext()

export const InterviewProvider = ({ children }) => {
    const [reportsLoading, setReportsLoading] = useState(false)
    const [reportLoading, setReportLoading] = useState(false)
    const [mockLoading, setMockLoading] = useState(false)
    const [mockStarting, setMockStarting] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [report, setReport] = useState(null)
    const [reports, setReports] = useState([])
    const [mockReport, setMockReport] = useState(null)
    const [mockReports, setMockReports] = useState([])

    return (
        <InterviewContext.Provider value={{
            reportsLoading,
            setReportsLoading,
            reportLoading,
            setReportLoading,
            mockLoading,
            setMockLoading,
            mockStarting,
            setMockStarting,
            generating,
            setGenerating,
            report,
            setReport,
            reports,
            setReports,
            mockReport,
            setMockReport,
            mockReports,
            setMockReports,
        }}>
            {children}
        </InterviewContext.Provider>
    )
}
