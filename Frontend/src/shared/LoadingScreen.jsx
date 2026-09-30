import "./loadingScreen.scss"

const LoadingScreen = ({
    title = "Loading",
    message = "Just a moment.",
    compact = false,
}) => {
    return (
        <main className={`app-loading ${compact ? "app-loading--compact" : ""}`} role="status" aria-live="polite">
            <img className="app-loading__mark" src="/hirevia-logo.png" alt="Hirevia" />
            <div className="app-loading__orbit" aria-hidden="true">
                <span />
            </div>
            <h1>{title}</h1>
            {message && <p>{message}</p>}
        </main>
    )
}

export default LoadingScreen
