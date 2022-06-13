import { notPost, getExistFiles } from '../utils/common'

export default (req, res) => {
  notPost(req.method)

  res.send(getExistFiles())
}