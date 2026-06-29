const mongoose = require('mongoose')

const errorLogSchema = new mongoose.Schema(
    {
        user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null},
        status: {type: Number, default: null},
        message: {type: String, default: ''},
        method: {type: String, default: ''},
        path: {type: String, default: ''},
        source: {type: String, default: 'client'},
        userAgent: {type: String, default: ''},
        meta: {type: mongoose.Schema.Types.Mixed, default: null},
    },
    {timestamps: true}
)

errorLogSchema.index({createdAt: -1})
errorLogSchema.index({status: 1})

module.exports = mongoose.model('ErrorLog', errorLogSchema)
