// Ambient namespace that firebase-admin normally provides; functions/src refers to it for doc typing.
declare namespace FirebaseFirestore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type DocumentData = { [field: string]: any };
}
