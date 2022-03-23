import { Component, createSignal } from 'solid-js';

import styles from './App.module.css';
import Home from './components/Home';

const App: Component = () => {
  const [value, setValue] = createSignal(0);

  return (
    <div class={styles.container}>
      <header>
        <Home number={value()} value="reactivity" />
        <button
          onClick={() => {
            setValue(value() + 1);
          }}
        >
          Increase number
        </button>
      </header>
    </div>
  );
};

export default App;
