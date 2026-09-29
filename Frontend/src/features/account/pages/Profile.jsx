import { useEffect, useState } from "react"
import { useAuth } from "../../auth/hooks/useAuth"
import AppShell from "../../../shared/AppShell"
import "./account.scss"

const Profile = () => {
    const { user, handleUpdateProfile } = useAuth()
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [phone, setPhone] = useState("")
    const [error, setError] = useState("")
    const [note, setNote] = useState("")
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setName(user?.username || "")
        setEmail(user?.email || "")
        setPhone(user?.phone || "")
    }, [user?.username, user?.email, user?.phone])

    const saveProfile = async (event) => {
        event.preventDefault()
        setSaving(true)
        setError("")
        setNote("")
        try {
            await handleUpdateProfile({ username: name, email, phone })
            setNote("Saved")
        } catch (err) {
            setError(err?.response?.data?.message || "Could not save your profile.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <AppShell>
            <form className="account-form" onSubmit={saveProfile}>
                <h1>Profile</h1>
                <p>Update the name, email, and contact number on your account.</p>
                <label htmlFor="profile-name">Name</label>
                <input
                    id="profile-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                />
                <label htmlFor="profile-email">Email</label>
                <input
                    id="profile-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                />
                <label htmlFor="profile-phone">Contact number</label>
                <input
                    id="profile-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    autoComplete="tel"
                    placeholder="Optional"
                />
                {error && <p className="account-form__error" role="alert">{error}</p>}
                {note && <p className="account-form__note">{note}</p>}
                <button type="submit" className="button primary-button" disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                </button>
            </form>
        </AppShell>
    )
}

export default Profile
