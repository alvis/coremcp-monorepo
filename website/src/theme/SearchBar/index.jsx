import React from 'react';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/pro-duotone-svg-icons';
import SearchBar from '@theme-original/SearchBar';

export default function SearchBarWrapper(props) {
  return (
    <div className="vitestSearchShell">
      <span className="vitestSearchGlyph" aria-hidden="true">
        <FontAwesomeIcon icon={faMagnifyingGlass} />
      </span>
      <SearchBar
        {...props}
        className={clsx(props.className, 'vitestSearchBar')}
      />
    </div>
  );
}
