const mongoose = require('mongoose')

const magicLinkTokenSchema = new mongoose.Schema(
  {
    user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    token: {type: String, required: true, unique: true},
    expiresAt: {type: Date, required: true},
  },
  {timestamps: true}
)

magicLinkTokenSchema.index({expiresAt: 1}, {expireAfterSeconds: 0})

module.exports = mongoose.model('MagicLinkToken', magicLinkTokenSchema)
