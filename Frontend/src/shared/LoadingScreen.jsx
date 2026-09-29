import "./loadingScreen.scss"

const LoadingScreen = ({
    title = "Loading",
    message = "Just a moment.",
    compact = false,
}) => {
    return (
        <main className={`app-loading ${compact ? "app-loading--compact" : ""}`} role="status" aria-live="polite">
            <div className="app-loading__mark">Hirevia</div>
            <div className="app-loading__orbit" aria-hidden="true">
                <span />
            </div>
            <h1>{title}</h1>
            {message && <p>{message}</p>}
        </main>
    )
}

export default LoadingScreen
