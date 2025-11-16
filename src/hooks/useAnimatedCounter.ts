import { useEffect, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import CountUp from 'react-countup';

export const useAnimatedCounter = (end: number, duration: number = 2) => {
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return { ref, inView, end, duration };
};
