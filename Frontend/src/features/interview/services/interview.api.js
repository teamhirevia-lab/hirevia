// This is used to interact with the Backend.

import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,
    headers: { "X-Requested-With": "hirevia" },
})

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function planIdempotencyStorageKey({ company, jobProfile, interviewWindow }) {
    return `plan-idempotency:${company}|${jobProfile}|${interviewWindow}`
}

export function nextPlanIdempotencyKey(details) {
    const storageKey = planIdempotencyStorageKey(details)
    let key = sessionStorage.getItem(storageKey)
    if (!key) {
        key = crypto.randomUUID()
        sessionStorage.setItem(storageKey, key)
    }
    return key
}

export function clearPlanIdempotencyKey(details) {
    sessionStorage.removeItem(planIdempotencyStorageKey(details))
}

async function waitForJob(jobId) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
        const response = await api.get(`/api/jobs/${jobId}`)
        const data = response.data
        if (data.status === "succeeded" && data.interviewReport) {
            return data
        }
        if (data.status === "failed") {
            const error = new Error(data.message || data.error || "Generation failed")
            error.response = { data, status: 500 }
            throw error
        }
        await sleep(2000)
    }
    const timeout = new Error("Timed out waiting for your plan. Check your dashboard in a moment.")
    timeout.response = { data: { message: timeout.message }, status: 504 }
    throw timeout
}

/**
 * @description Service to generate interview report based on user self description, resume and job description.
 */
export const generateInterviewReport = async ({
    jobDescription,
    selfDescription,
    resumeFile,
    company,
    jobProfile,
    yearsOfExperience,
    interviewWindow,
}) => {

    const formData = new FormData()
    formData.append("jobDescription", jobDescription)
    formData.append("selfDescription", selfDescription)
    formData.append("company", company)
    formData.append("jobProfile", jobProfile)
    formData.append("yearsOfExperience", String(yearsOfExperience))
    formData.append("interviewWindow", interviewWindow)
    if (resumeFile) {
        formData.append("resume", resumeFile)
    }

    const idempotencyKey = nextPlanIdempotencyKey({ company, jobProfile, interviewWindow })

    try {
        const response = await api.post(
            "/api/interview/",
            formData,
            { headers: { "Idempotency-Key": idempotencyKey } }
        )

        if (response.status === 202 && response.data?.jobId) {
            const done = await waitForJob(response.data.jobId)
            clearPlanIdempotencyKey({ company, jobProfile, interviewWindow })
            return { interviewReport: done.interviewReport }
        }

        clearPlanIdempotencyKey({ company, jobProfile, interviewWindow })
        return response.data
    } catch (err) {
        if (err?.response?.data?.status === "failed" || err?.response?.status === 500) {
            clearPlanIdempotencyKey({ company, jobProfile, interviewWindow })
        }
        throw err
    }
}


/**
 * @description Service to get interview report by interviewId.
 */
export const getInterviewReportById = async (interviewId) => {
    const response = await api.get(`/api/interview/report/${interviewId}`, {
        params: { include: "resume,research" },
    })

    return response.data
}

/**
 * @description Service to delete interview report by interviewId.
 */
export const deleteInterviewReportById = async (interviewId) => {

    await api.delete(`/api/interview/report/${interviewId}`)
    
}


/**
 * @description Service to get all interview reports of logged in user.
 */
export const getAllInterviewReports = async () => {
    const response = await api.get("/api/interview/")

    return response.data
}


/**
 * @description Service to generate resume pdf based on user self description, resume content and job description.
 */
export const generateResumePdf = async ({ interviewReportId, template = "classic" }) => {
    const response = await api.post(`/api/interview/resume/pdf/${interviewReportId}`, { template }, {
        responseType: "blob"
    })

    return response.data
}
