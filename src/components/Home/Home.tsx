import { Component } from 'solid-js';

export const Home: Component<{ number: number; value: string }> = ({
  number = 42,
  ...props
}) => {
  return (
    <div>
      <p>Here is the number: {number}</p>
      <p>
        Value accessed using <b>rest</b> operator: {props.value}
      </p>
    </div>
  );
};
