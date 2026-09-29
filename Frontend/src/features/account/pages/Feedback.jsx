import { useEffect, useState } from "react"
import { useAuth } from "../../auth/hooks/useAuth"
import { submitFeedback } from "../../auth/services/auth.api"
import AppShell from "../../../shared/AppShell"
import "./account.scss"

const Feedback = () => {
    const { user } = useAuth()
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [phone, setPhone] = useState("")
    const [message, setMessage] = useState("")
    const [error, setError] = useState("")
    const [note, setNote] = useState("")
    const [sending, setSending] = useState(false)

    useEffect(() => {
        setName(user?.username || "")
        setEmail(user?.email || "")
        setPhone(user?.phone || "")
    }, [user?.username, user?.email, user?.phone])

    const sendFeedback = async (event) => {
        event.preventDefault()
        setSending(true)
        setError("")
        setNote("")
        try {
            await submitFeedback({ name, email, phone, message })
            setNote("Sent. Thank you.")
            setMessage("")
        } catch (err) {
            setError(err?.response?.data?.message || "Could not send feedback.")
        } finally {
            setSending(false)
        }
    }

    return (
        <AppShell>
            <form className="account-form" onSubmit={sendFeedback}>
                <h1>Feedback</h1>
                <p>Tell us what worked and what should change.</p>
                <label htmlFor="feedback-name">Name</label>
                <input
                    id="feedback-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                />
                <label htmlFor="feedback-email">Email</label>
                <input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                />
                <label htmlFor="feedback-phone">Contact number</label>
                <input
                    id="feedback-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                    placeholder="Optional"
                />
                <label htmlFor="feedback-message">Message</label>
                <textarea
                    id="feedback-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={6}
                    maxLength={2000}
                    required
                />
                {error && <p className="account-form__error" role="alert">{error}</p>}
                {note && <p className="account-form__note">{note}</p>}
                <button type="submit" className="button primary-button" disabled={sending}>
                    {sending ? "Sending..." : "Send"}
                </button>
            </form>
        </AppShell>
    )
}

export default Feedback
