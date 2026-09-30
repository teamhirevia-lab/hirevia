import { Link } from "react-router"

const BrandLogo = ({ to = "/", className = "", ...props }) => {
    return (
        <Link to={to} className={`brand-logo ${className}`.trim()} aria-label="Hirevia" {...props}>
            <img src="/hirevia-logo.png" alt="" />
        </Link>
    )
}

export default BrandLogo
