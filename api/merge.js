import { notPost, mergeChunks } from '../utils/common'

export default (req, res) => {
  notPost(req.method)

  res.json(mergeChunks(req.body))
}
