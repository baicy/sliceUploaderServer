import formidable from 'formidable'
import { notPost, uploadChunk } from '../utils/common'

export default (req, res) => {
  notPost(req.method)

  const form = new formidable.IncomingForm({ uploadDir: './tmp' })

  form.parse(req, function (_, fields, file) {
    const { md5, index } = fields
    uploadChunk({ filepath: file.data.filepath, md5, index })
    .then(
      (data) => res.json({ ok: 1, md5, chunk: data }),
      (error) => res.json({ ok: 0, md5, chunk: error, msg: '上传失败' })
    )
  })
}
