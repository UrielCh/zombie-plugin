export const wait = (duration: number) => new Promise(resolve => {setTimeout(() => (resolve(undefined)), duration);});
