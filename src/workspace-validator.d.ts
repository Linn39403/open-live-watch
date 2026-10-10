declare const validate: {
  (input: unknown): boolean;
  errors: null | Array<{ instancePath: string; message?: string }>;
};
export default validate;
