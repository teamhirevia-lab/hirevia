import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,
    headers: { "X-Requested-With": "hirevia" },
})

export const startMockInterview = async (interviewId, section) => {

    const response = await api.post(`/api/interview/${interviewId}/mock`, { section })
    return response.data;

}

export const generateMockInterviewReport = async({interviewId, mockId, answers}) => {

    const response = await api.post(
        `/api/interview/${interviewId}/mock/${mockId}`,
        {answers}
    )

    return response.data;

}

/**
 * 
 * @param {*} interviewId 
 * @description Service to get all mock interviews for that interview report 
 */
export const getAllMockInterviewReports = async(interviewId) => {

    const response = await api.get(`/api/interview/${interviewId}/mock`)

    return response.data

}


export const getMockInterview = async (interviewId, mockId) => {

    const response = await api.get(`/api/interview/${interviewId}/mock/${mockId}/report`)

    return response.data

}

export const deleteMockInterview = async (interviewId, mockId) => {

    await api.delete(`/api/interview/${interviewId}/mock/${mockId}`)

}

export const updateMockInterview = async ({interviewId, mockId, completedSections, answers, currentQuestionIndex, currentSection}) => {

    const response = await api.patch(`/api/interview/${interviewId}/mock/${mockId}/progress`, {completedSections, answers, currentQuestionIndex, currentSection})

    return response.data

}

export const submitMockAnswer = async ({
    interviewId,
    mockId,
    section,
    questionIndex,
    questionId,
    question,
    expectedAnswer,
    userAnswer,
    videoMetrics,
    duration,
}) => {
    const response = await api.post(`/api/interview/${interviewId}/mock/${mockId}/answer`, {
        section,
        questionIndex,
        questionId,
        question,
        expectedAnswer,
        userAnswer,
        videoMetrics,
        duration,
    })

    return response.data
}