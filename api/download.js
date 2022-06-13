import { notPost, sendFile } from '../utils/common'

export default (req, res) => {
  notPost(req.method)

  sendFile(req.body)
  .then(
    data => {
      Object.entries(data.headers).forEach(header => res.setHeader(header[0], header[1]))
      res.send(data.buffer)
    },
    err => res.json(err)
  )
}
