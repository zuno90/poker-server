const definePos = (arr: number[]) => {
  const randomBig = Math.round((Math.random() * 10) % (arr.length - 1)); // [0,1,2,3]
  if (randomBig === 0) {
    console.log(randomBig);
  } else {
    console.log('lhac 0');
  }
};

definePos([0, 1, 2]);
