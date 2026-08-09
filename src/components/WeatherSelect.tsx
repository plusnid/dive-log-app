import type { ComponentType } from 'react'
import type { Weather } from '../types/diveLog'
import { weatherOptions } from '../types/weatherOptions'
import { CloudIcon, NoneIcon, RainIcon, SunIcon, WeatherOtherIcon } from './icons'
import './WeatherSelect.css'

interface WeatherSelectProps {
  value: Weather | undefined
  onChange: (value: Weather | undefined) => void
}

const weatherIcons: Record<Weather, ComponentType<{ className?: string }>> = {
  sunny: SunIcon,
  cloudy: CloudIcon,
  rainy: RainIcon,
  other: WeatherOtherIcon,
}

/**
 * 天候のセグメントコントロール（`fieldset` + `input[type=radio]`）。
 * 選択肢・保存値は変更しない（REQ-3.2）。先頭に「なし」（選択なし）を常設する。
 */
export function WeatherSelect({ value, onChange }: WeatherSelectProps) {
  return (
    <fieldset className="weather-select">
      <legend className="weather-select__legend">天候</legend>
      <div className="weather-select__options">
        <label className="weather-select__option">
          <input
            type="radio"
            name="weather"
            value=""
            checked={value === undefined}
            onChange={() => onChange(undefined)}
          />
          <NoneIcon className="weather-select__icon" />
          <span className="weather-select__label">なし</span>
        </label>
        {weatherOptions.map((option) => {
          const Icon = weatherIcons[option.value]
          return (
            <label key={option.value} className="weather-select__option">
              <input
                type="radio"
                name="weather"
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              <Icon className="weather-select__icon" />
              <span className="weather-select__label">{option.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
