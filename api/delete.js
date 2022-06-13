import { notPost, deleteFile } from '../utils/common'

export default (req, res) => {
  notPost(req.method)

  res.json(deleteFile(req.body))
}
