import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Searchbar, Chip, useTheme } from 'react-native-paper';

interface FilterOption {
  label: string;
  value: string;
  active: boolean;
}

interface SearchFilterBarProps {
  searchValue: string;
  onSearch: (query: string) => void;
  placeholder?: string;
  filters?: FilterOption[];
  onFilterToggle?: (filterValue: string) => void;
}

const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  searchValue,
  onSearch,
  placeholder = 'Search...',
  filters,
  onFilterToggle,
}) => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder={placeholder}
        onChangeText={onSearch}
        value={searchValue}
        style={[
          styles.searchbar,
          { backgroundColor: theme.colors.surfaceVariant },
        ]}
        inputStyle={styles.input}
        elevation={0}
      />
      {filters && filters.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContainer}
        >
          {filters.map((filter) => (
            <Chip
              key={filter.value}
              selected={filter.active}
              onPress={() => onFilterToggle?.(filter.value)}
              style={[
                styles.chip,
                filter.active && {
                  backgroundColor: theme.colors.primaryContainer,
                },
              ]}
              textStyle={
                filter.active
                  ? { color: theme.colors.onPrimaryContainer }
                  : undefined
              }
              mode="outlined"
              showSelectedOverlay
            >
              {filter.label}
            </Chip>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchbar: {
    borderRadius: 12,
  },
  input: {
    fontSize: 14,
  },
  filtersContainer: {
    paddingTop: 8,
    gap: 8,
  },
  chip: {
    marginRight: 0,
  },
});

export default SearchFilterBar;
