const multer = require("multer")

const upload = multer({
    storage: multer.memoryStorage(),
    limits:{
        fileSize: 3 * 1024 * 1024 // 3 MB
    }
})

function isPdfBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false
    const header = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1")
    return header.includes("%PDF-")
}

module.exports = upload
module.exports.isPdfBuffer = isPdfBuffer